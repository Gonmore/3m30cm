import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate, useParams } from "react-router-dom";
import { useApi, handleApiResponse } from "../api/client";
import type { CoachTemplateDetail, DayType, ExerciseTaskTemplate, ProgramPhaseDayTemplate, ProgramPhaseTemplate } from "../types/api";

type ExercisePick = { id: string; name: string; slug: string; category: string; equipment?: string | null; evolution?: string | null; zone?: string | null; description?: string | null; requiresLoad?: boolean; perLeg?: boolean; defaultSeriesProtocol?: string };

const DAY_TYPES: { value: DayType; label: string }[] = [
  { value: "EXPLOSIVE", label: "Explosivo" }, { value: "STRENGTH", label: "Fuerza" }, { value: "RECOVERY", label: "RecuperaciÃ³n" }, { value: "REST", label: "Descanso" }, { value: "UPPER_CORE", label: "Tren superior/Core" }, { value: "OTHER", label: "Otro" },
];
const EVOLUTION_GOALS = [
  { value: "TIME", label: "Tiempo" }, { value: "VELOCITY", label: "Velocidad" }, { value: "WEIGHT", label: "Peso" }, { value: "INTENSITY", label: "Intensidad" }, { value: "HEIGHT", label: "Altura" }, { value: "DISTANCE", label: "Distancia" },
];
const ZONES = [{ value: "LOWER", label: "Tronco inferior" }, { value: "UPPER", label: "Tronco superior" }, { value: "CORE", label: "Core" }, { value: "FULL", label: "Cuerpo completo" }];

function moneyInputToCents(value: string) {
  const n = Number(String(value).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
function toGoals(task: ExerciseTaskTemplate): string[] {
  if (Array.isArray(task.evolutionGoals) && task.evolutionGoals.length) return task.evolutionGoals;
  return task.evolution ? [task.evolution] : ["WEIGHT"];
}

function SortableTaskRow(props: { task: ExerciseTaskTemplate; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }} className="flex items-center gap-2 rounded border border-surface-800 bg-surface-950 px-2 py-1.5 text-sm">
      <button type="button" className="cursor-grab touch-none px-1 text-surface-500" {...attributes} {...listeners} aria-label="Arrastrar">â‹®â‹®</button>
      <span className="min-w-0 flex-1 truncate text-surface-100">{props.task.name}</span>
      <span className="hidden text-xs text-surface-500 sm:inline">{props.task.sets ? `${props.task.sets}Ã—` : ""}{props.task.repsOrTimeText ?? ""}</span>
      {!props.task.exerciseId ? <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300" title="Sin ejercicio global vinculado: no registra carga/historial hasta vincular">sin vÃ­nculo</span> : null}
      <button type="button" onClick={props.onEdit} className="text-xs text-primary-400">Editar</button>
      <button type="button" onClick={props.onDelete} className="text-xs text-red-400">Eliminar</button>
    </div>
  );
}

function TaskEditorModal(props: {
  task: ExerciseTaskTemplate; allDays: Array<{ phaseId: string; phaseName: string; dayId: string; label: string; tasks: ExerciseTaskTemplate[] }>; exerciseResults: ExercisePick[]; onSearch: (q: string) => void;
  onClose: () => void; onSave: (patch: Partial<ExerciseTaskTemplate>) => void; onPickExercise: (ex: ExercisePick) => void; onCopyFrom: (source: ExerciseTaskTemplate) => void;
}) {
  const [t, setT] = useState<ExerciseTaskTemplate>({ ...props.task, evolutionGoals: toGoals(props.task), blockItems: Array.isArray(props.task.blockItems) ? props.task.blockItems : (props.task.blockItems ? [] : []) });
  const [q, setQ] = useState(""); const [pickMode, setPickMode] = useState<"new" | "program">("new");
  useEffect(() => { const id = setTimeout(() => props.onSearch(q), 250); return () => clearTimeout(id); }, [q]); // eslint-disable-line
  const set = <K extends keyof ExerciseTaskTemplate>(k: K, v: ExerciseTaskTemplate[K]) => setT((p) => ({ ...p, [k]: v }));
  const toggleGoal = (g: string) => setT((p) => { const cur = new Set(p.evolutionGoals ?? []); if (cur.has(g)) cur.delete(g); else cur.add(g); const arr = Array.from(cur); return { ...p, evolutionGoals: arr, evolution: (arr[0] as ExerciseTaskTemplate["evolution"]) || "WEIGHT" }; });
  type BlockItem = { name: string; sets?: number | null; repsText?: string | null; notes?: string | null };
  const blockItems = (Array.isArray(t.blockItems) ? t.blockItems : []) as BlockItem[];
  const setBlockItem = (i: number, patch: Partial<BlockItem>) => set("blockItems", blockItems.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={props.onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-surface-900 p-4 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-surface-100">Editar ejercicio</h4><button onClick={props.onClose} className="text-surface-400">âœ•</button></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-surface-400">Nombre<input value={t.name} onChange={(e) => set("name", e.target.value)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
          <label className="text-xs text-surface-400">CategorÃ­a<input value={t.category ?? ""} onChange={(e) => set("category", e.target.value || null)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
          <label className="text-xs text-surface-400">Equipo<input value={t.equipment ?? ""} onChange={(e) => set("equipment", e.target.value || null)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
          <label className="text-xs text-surface-400">Zona<select value={t.zone} onChange={(e) => set("zone", e.target.value)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100">{ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}</select></label>
          <label className="text-xs text-surface-400">Series<input type="number" min={1} value={t.sets ?? ""} onChange={(e) => set("sets", e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
          <label className="text-xs text-surface-400">Reps/tiempo<input value={t.repsOrTimeText ?? ""} onChange={(e) => set("repsOrTimeText", e.target.value || null)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
        </div>
        <label className="mt-2 block text-xs text-surface-400">DescripciÃ³n<textarea value={t.description ?? ""} onChange={(e) => set("description", e.target.value || null)} rows={2} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
        <label className="mt-2 block text-xs text-surface-400">Video (YouTube/URL)<input value={t.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value || null)} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-surface-300">
          <label className="flex items-center gap-1"><input type="checkbox" checked={t.requiresWeight} onChange={(e) => set("requiresWeight", e.target.checked)} /> Requiere peso</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={t.isUnilateral} onChange={(e) => set("isUnilateral", e.target.checked)} /> Unilateral</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(t.isBlock)} onChange={(e) => set("isBlock", e.target.checked)} /> Bloque (agrupaciÃ³n)</label>
        </div>
        {t.isBlock ? <div className="mt-2 rounded border border-surface-800 p-2"><p className="text-xs text-surface-400">Ãtems del bloque (MVP, guardados en plantilla)</p>{blockItems.map((it, i) => <div key={i} className="mt-1 grid gap-1 sm:grid-cols-4"><input value={it.name ?? ""} onChange={(e) => setBlockItem(i, { name: e.target.value })} placeholder="Nombre" className="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-surface-100 sm:col-span-2" /><input type="number" value={it.sets ?? ""} onChange={(e) => setBlockItem(i, { sets: e.target.value ? Number(e.target.value) : null })} placeholder="sets" className="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-surface-100" /><div className="flex gap-1"><input value={it.repsText ?? ""} onChange={(e) => setBlockItem(i, { repsText: e.target.value || null })} placeholder="reps" className="min-w-0 flex-1 rounded border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-surface-100" /><button type="button" onClick={() => set("blockItems", blockItems.filter((_, idx) => idx !== i))} className="text-red-400">Ã—</button></div></div>)}<button type="button" onClick={() => set("blockItems", [...blockItems, { name: "" }])} className="mt-2 text-xs text-primary-400">+ Ãtem</button></div> : null}
        <div className="mt-2"><p className="text-xs text-surface-400">EvoluciÃ³n / objetivo de progresiÃ³n (prescripciÃ³n del programa)</p><div className="mt-1 flex flex-wrap gap-2">{EVOLUTION_GOALS.map((g) => <label key={g.value} className="flex items-center gap-1 text-xs text-surface-300"><input type="checkbox" checked={(t.evolutionGoals ?? []).includes(g.value)} onChange={() => toggleGoal(g.value)} />{g.label}</label>)}</div></div>
        <div className="mt-3 rounded border border-surface-800 p-2">
          <p className="text-xs text-surface-400">Vincular ejercicio global (opcional, necesario para carga/historial)</p>
          <div className="mt-1 flex gap-2 text-xs"><button type="button" onClick={() => setPickMode("new")} className={`rounded px-2 py-1 ${pickMode === "new" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>CatÃ¡logo</button><button type="button" onClick={() => setPickMode("program")} className={`rounded px-2 py-1 ${pickMode === "program" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Del programa</button></div>
          {pickMode === "new" ? (
            <div className="mt-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en catÃ¡logo globalâ€¦" className="w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" />
              <div className="mt-1 max-h-28 overflow-y-auto">{props.exerciseResults.slice(0, 12).map((ex) => <button key={ex.id} type="button" onClick={() => props.onPickExercise(ex)} className="block w-full rounded px-2 py-1 text-left text-xs text-surface-200 hover:bg-surface-800">{ex.name} Â· {ex.category}</button>)}</div></div>
          ) : (
            <div className="mt-2 max-h-32 overflow-y-auto text-xs">{props.allDays.map((d) => <div key={d.dayId} className="mb-1"><p className="text-surface-500">{d.phaseName} / {d.label}</p>{d.tasks.filter((x) => x.id !== t.id).map((x) => <button key={x.id} type="button" onClick={() => props.onCopyFrom(x)} className="block w-full rounded px-2 py-1 text-left text-surface-200 hover:bg-surface-800">Copiar: {x.name}</button>)}</div>)}</div>
          )}
          {t.exerciseId ? <p className="mt-1 text-xs text-green-400">Vinculado: {t.exercise?.name ?? t.exerciseId}</p> : <p className="mt-1 text-xs text-amber-300">Sin vÃ­nculo global (ejercicio propio del programa; carga/historial no disponible).</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={props.onClose} className="rounded bg-surface-800 px-3 py-2 text-sm text-surface-200">Cancelar</button><button type="button" onClick={() => props.onSave(t)} className="rounded bg-primary-600 px-3 py-2 text-sm text-white">Guardar ejercicio</button></div>
      </div>
    </div>
  );
}

function PreviewModal(props: { phases: ProgramPhaseTemplate[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-surface-950 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-surface-100">Vista previa (tipo atleta)</h4><button onClick={props.onClose} className="text-surface-400">âœ•</button></div>
        {props.phases.map((ph) => <div key={ph.id} className="mb-4"><p className="text-sm font-medium text-primary-400">{ph.name}</p>{(ph.days ?? []).map((d) => <div key={d.id} className="mt-2 rounded bg-surface-900 p-3"><p className="text-sm text-surface-100">DÃ­a {d.dayNumber}{d.title ? ` â€” ${d.title}` : ""} {d.dayType === "REST" ? "(Descanso)" : ""}</p>{(d.tasks ?? []).map((tk, i) => <div key={tk.id} className="mt-1 border-t border-surface-800 pt-1 text-xs text-surface-300"><span className="text-surface-500">{i + 1}.</span> {tk.name} {tk.sets ? `Â· ${tk.sets} series` : ""} {tk.repsOrTimeText ? `Â· ${tk.repsOrTimeText}` : ""}{tk.videoUrl ? <span className="ml-1 text-primary-400">Â· video</span> : ""}{tk.description ? <p className="text-surface-500">{tk.description}</p> : null}</div>)}</div>)}</div>)}
      </div>
    </div>
  );
}

export default function CoachProgramEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "nuevo";
  const api = useApi();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<CoachTemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [objective, setObjective] = useState(""); const [description, setDescription] = useState("");
  const [isPremium, setIsPremium] = useState(false); const [price, setPrice] = useState(""); const [currency, setCurrency] = useState("USD");
  const [usesPhases, setUsesPhases] = useState(false); const [cycleLengthDays, setCycleLengthDays] = useState(14);
  const [phaseName, setPhaseName] = useState("Fase 1"); const [phaseDuration, setPhaseDuration] = useState(14); const [masterBlockDays, setMasterBlockDays] = useState<7 | 14>(7);
  const [exerciseResults, setExerciseResults] = useState<ExercisePick[]>([]);
  const [openPhases, setOpenPhases] = useState<Set<string>>(new Set());
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [editingPhase, setEditingPhase] = useState<ProgramPhaseTemplate | null>(null);
  const [phaseEditDraft, setPhaseEditDraft] = useState<{ name: string; durationDays: number; masterBlockDays: 7 | 14 } | null>(null);
  const [confirmDeletePhase, setConfirmDeletePhase] = useState<ProgramPhaseTemplate | null>(null);
  const [editingDay, setEditingDay] = useState<{ phaseId: string; day: ProgramPhaseDayTemplate } | null>(null);
  const [editingTask, setEditingTask] = useState<{ phaseId: string; dayId: string; task: ExerciseTaskTemplate } | null>(null);
  const [addTaskTarget, setAddTaskTarget] = useState<{ phaseId: string; dayId: string } | null>(null);
  const [addTaskQuery, setAddTaskQuery] = useState(""); const [addTaskMode, setAddTaskMode] = useState<"new" | "program">("new");
  const [preview, setPreview] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const load = async (templateId: string) => {
    const res = await api(`/coach/program-templates/${templateId}`);
    const data = await handleApiResponse<{ template: CoachTemplateDetail }>(res);
    const tpl = data.template; setTemplate(tpl);
    setName(tpl.name ?? ""); setCode(tpl.code ?? ""); setObjective(tpl.objective ?? ""); setDescription(tpl.description ?? "");
    setIsPremium(Boolean(tpl.isPremium)); setPrice(tpl.displayPriceCents != null ? String(tpl.displayPriceCents / 100) : ""); setCurrency(tpl.currency || "USD");
    setUsesPhases(Boolean(tpl.usesPhases)); setCycleLengthDays(tpl.cycleLengthDays ?? 14);
  };
  useEffect(() => { if (!isNew && id) void load(id).catch((e) => setError(e instanceof Error ? e.message : "Error")); }, [id, isNew]); // eslint-disable-line
  const searchExercises = (q: string) => {
    if (!q.trim()) { setExerciseResults([]); return; }
    void (async () => { try { const res = await api(`/coach/exercises?q=${encodeURIComponent(q.trim())}`); const data = await handleApiResponse<{ exercises: ExercisePick[] }>(res); setExerciseResults(data.exercises ?? []); } catch { /* ignore */ } })();
  };
  useEffect(() => { const t = setTimeout(() => searchExercises(addTaskQuery), 250); return () => clearTimeout(t); }, [addTaskQuery]); // eslint-disable-line

  const saveBase = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const body = { name, code: code || undefined, objective: objective || null, description: description || null, isPremium, displayPriceCents: moneyInputToCents(price), currency, usesPhases, cycleLengthDays };
      if (isNew) { const res = await api("/coach/program-templates", { method: "POST", body: JSON.stringify(body) }); const data = await handleApiResponse<{ template: CoachTemplateDetail }>(res); navigate(`/coach/programas/${data.template.id}`, { replace: true }); }
      else if (id) { const res = await api(`/coach/program-templates/${id}`, { method: "PUT", body: JSON.stringify(body) }); await handleApiResponse(res); await load(id); }
    } catch (err) { setError(err instanceof Error ? err.message : "Error al guardar"); } finally { setSaving(false); }
  };
  const apiMutate = async (path: string, method: string, body?: unknown) => {
    if (!id) return; setError(null);
    try { const res = await api(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); const data = await handleApiResponse<{ phases?: ProgramPhaseTemplate[] }>(res); if (data.phases) setTemplate((prev) => (prev ? { ...prev, phases: data.phases ?? [] } : prev)); else await load(id); }
    catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };
  const phases = useMemo(() => template?.phases ?? [], [template]);
  const allDays = useMemo(() => phases.flatMap((p) => (p.days ?? []).map((d) => ({ phaseId: p.id, phaseName: p.name, dayId: d.id, label: `DÃ­a ${d.dayNumber}${d.title ? ` â€” ${d.title}` : ""}`, tasks: d.tasks ?? [] }))), [phases]);
  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); setter(n); };

  const startEditPhase = (phase: ProgramPhaseTemplate) => {
    setEditingPhase(phase);
    setPhaseEditDraft({ name: phase.name, durationDays: phase.durationDays, masterBlockDays: (phase.masterBlockDays === 14 ? 14 : 7) as 7 | 14 });
    setOpenPhases((prev) => new Set(prev).add(phase.id));
  };
  const commitPhaseEdit = () => {
    if (editingPhase && phaseEditDraft) savePhase(editingPhase, phaseEditDraft);
    setEditingPhase(null); setPhaseEditDraft(null);
  };
  const addPhase = () => void apiMutate(`/coach/program-templates/${id}/phases`, "POST", { name: phaseName, durationDays: phaseDuration, masterBlockDays, orderIndex: phases.length + 1 });
  const savePhase = (p: ProgramPhaseTemplate, patch: Partial<ProgramPhaseTemplate>) => void apiMutate(`/coach/program-templates/${id}/phases/${p.id}`, "PUT", patch);
  const delPhase = (phaseId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}`, "DELETE");
  const addDay = (phaseId: string) => { const ph = phases.find((p) => p.id === phaseId); void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days`, "POST", { dayNumber: (ph?.days?.length ?? 0) + 1, title: `DÃ­a ${(ph?.days?.length ?? 0) + 1}`, dayType: "OTHER" as DayType }); };
  const saveDay = (phaseId: string, dayId: string, patch: Partial<ProgramPhaseDayTemplate>) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}`, "PUT", patch);
  const delDay = (phaseId: string, dayId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}`, "DELETE");
  const linkDay = (phaseId: string, sourceDayId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/link`, "POST", { sourceDayId });
  const copyTask = (phaseId: string, dayId: string, sourceTaskId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks/copy`, "POST", { sourceTaskId });
  const createTask = (phaseId: string, dayId: string, ex?: ExercisePick) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks`, "POST", { name: ex?.name ?? "Nuevo ejercicio", exerciseId: ex?.id ?? null, category: ex?.category ?? null, equipment: ex?.equipment ?? null, description: ex?.description ?? null, requiresWeight: Boolean(ex?.requiresLoad), isUnilateral: Boolean(ex?.perLeg), evolution: (ex?.evolution as "WEIGHT" | "TIME" | "VELOCITY" | "HYBRID") ?? "WEIGHT", evolutionGoals: ex?.evolution ? [ex.evolution] : ["WEIGHT"], zone: (ex?.zone as "LOWER" | "UPPER" | "CORE" | "FULL") ?? "FULL", defaultSeriesProtocol: ex?.defaultSeriesProtocol ?? "NONE" });
  const saveTask = (phaseId: string, dayId: string, taskId: string, patch: Partial<ExerciseTaskTemplate>) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks/${taskId}`, "PUT", patch);
  const delTask = (phaseId: string, dayId: string, taskId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks/${taskId}`, "DELETE");
  const onDragEnd = (phaseId: string, dayId: string, tasks: ExerciseTaskTemplate[], e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const old = tasks.findIndex((t) => t.id === e.active.id); const nw = tasks.findIndex((t) => t.id === e.over!.id);
    if (old < 0 || nw < 0) return;
    const ordered = arrayMove(tasks, old, nw);
    setTemplate((prev) => prev ? ({ ...prev, phases: (prev.phases ?? []).map((p) => p.id !== phaseId ? p : ({ ...p, days: (p.days ?? []).map((d) => d.id !== dayId ? d : ({ ...d, tasks: ordered })) })) }) : prev);
    void saveTask(phaseId, dayId, String(e.active.id), { orderIndex: nw + 1 });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-2xl font-bold text-surface-100">{isNew ? "Nuevo programa" : "Editar programa"}</h2>{!isNew ? <button type="button" onClick={() => setPreview(true)} className="rounded bg-surface-800 px-3 py-2 text-sm text-surface-100">Vista previa</button> : null}</div>
      {error ? <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div> : null}
      <form onSubmit={saveBase} className="space-y-3 rounded-lg bg-surface-900 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-surface-300">Nombre<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
          <label className="text-sm text-surface-300">CÃ³digo<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AUTO si vacÃ­o" className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        </div>
        <label className="block text-sm text-surface-300">Objetivo<input value={objective} onChange={(e) => setObjective(e.target.value)} className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        <label className="block text-sm text-surface-300">DescripciÃ³n<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm text-surface-300">Ciclo (dÃ­as)<input type="number" min={1} value={cycleLengthDays} onChange={(e) => setCycleLengthDays(Number(e.target.value))} className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
          <label className="flex items-center gap-2 pt-6 text-sm text-surface-300"><input type="checkbox" checked={usesPhases} onChange={(e) => setUsesPhases(e.target.checked)} /> Usa fases</label>
          <label className="block pt-1 text-sm text-surface-300"><span className="flex items-center gap-2"><input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} /> De Pago</span><span className="block text-xs text-surface-500">Requiere aprobaciÃ³n del coach para activarse al atleta.</span></label>
          <div className="grid grid-cols-[1fr_auto] gap-2"><label className="text-sm text-surface-300">Precio<input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label><label className="text-sm text-surface-300">Divisa<select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 rounded-md border border-surface-700 bg-surface-950 px-2 py-2 text-surface-100"><option value="USD">USD ($)</option><option value="ARS">ARS</option><option value="EUR">EUR (â‚¬)</option></select></label></div>
        </div>
        <p className="text-xs text-surface-500">Aprobados: {template?.approvedAssignmentCount ?? 0} Â· Ingreso esperado (display): {template ? new Intl.NumberFormat("es-AR", { style: "currency", currency: template.currency || "USD", maximumFractionDigits: 0 }).format((template.expectedRevenueCents ?? 0) / 100) : "â€”"}</p>
        <button disabled={saving} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardandoâ€¦" : isNew ? "Crear programa" : "Guardar cambios"}</button>
      </form>

      {!isNew && id && (
        <section className="space-y-3 rounded-lg bg-surface-900 p-4">
          <h3 className="text-lg font-semibold text-surface-100">Fases, dÃ­as y ejercicios</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <input value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="Nombre fase" className="rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100" />
            <input type="number" min={1} value={phaseDuration} onChange={(e) => setPhaseDuration(Number(e.target.value))} className="rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100" />
            <select value={masterBlockDays} onChange={(e) => setMasterBlockDays(Number(e.target.value) as 7 | 14)} className="rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100"><option value={7}>Bloque 7</option><option value={14}>Bloque 14</option></select>
            <button type="button" onClick={addPhase} className="rounded-md bg-surface-800 px-3 py-2 text-sm text-surface-100">+ Agregar fase</button>
          </div>
          {phases.length === 0 ? <p className="text-sm text-surface-500">Todo contraÃ­do / vacÃ­o. AgregÃ¡ una fase.</p> : phases.map((phase) => {
            const open = openPhases.has(phase.id);
            return (
              <div key={phase.id} className="rounded-md border border-surface-800">
                <div className="flex items-center justify-between gap-2 p-3">
                  <button type="button" onClick={() => toggle(openPhases, phase.id, setOpenPhases)} className="text-left"><p className="font-medium text-surface-100">{open ? "â–¾" : "â–¸"} {phase.name}</p><p className="text-xs text-surface-500">{phase.durationDays} dÃ­as Â· bloque {phase.masterBlockDays} Â· {(phase.days ?? []).length} dÃ­as</p></button>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); startEditPhase(phase); }} className="rounded p-1 text-blue-500 hover:bg-surface-800" aria-label="Editar fase" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDeletePhase(phase); }} className="rounded p-1 text-red-500 hover:bg-surface-800" aria-label="Eliminar fase" title="Eliminar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
                  </div>
                </div>
                {open ? <div className="border-t border-surface-800 p-3">
                  {editingPhase?.id === phase.id && phaseEditDraft ? <div className="mb-3 grid gap-2 rounded bg-surface-950 p-2 sm:grid-cols-4"><input value={phaseEditDraft.name} onChange={(e) => setPhaseEditDraft({ ...phaseEditDraft, name: e.target.value })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-sm text-surface-100" /><input type="number" value={phaseEditDraft.durationDays} onChange={(e) => setPhaseEditDraft({ ...phaseEditDraft, durationDays: Number(e.target.value) })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-sm text-surface-100" /><select value={phaseEditDraft.masterBlockDays} onChange={(e) => setPhaseEditDraft({ ...phaseEditDraft, masterBlockDays: Number(e.target.value) as 7 | 14 })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-sm text-surface-100"><option value={7}>7</option><option value={14}>14</option></select><div className="flex gap-2"><button type="button" onClick={commitPhaseEdit} className="rounded bg-primary-600 px-2 py-1 text-xs text-white">Guardar</button><button type="button" onClick={() => { setEditingPhase(null); setPhaseEditDraft(null); }} className="text-xs text-surface-400">Cancelar</button></div></div> : null}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(phase.days ?? []).map((day) => {
                      const dopen = openDays.has(day.id);
                      return (
                        <div key={day.id} className="rounded bg-surface-950 p-2">
                          <div className="flex items-center justify-between"><button type="button" onClick={() => toggle(openDays, day.id, setOpenDays)} className="text-left text-sm text-surface-100">{dopen ? "â–¾" : "â–¸"} DÃ­a {day.dayNumber}{day.title ? ` â€” ${day.title}` : ""}</button><button type="button" onClick={() => setEditingDay({ phaseId: phase.id, day })} className="text-xs text-primary-400">Editar</button></div>
                          <p className="text-[11px] text-surface-500">{DAY_TYPES.find((x) => x.value === day.dayType)?.label ?? day.dayType} Â· {(day.tasks ?? []).length} ejercicios</p>
                          {dopen ? <div className="mt-2 space-y-1">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(phase.id, day.id, day.tasks ?? [], e)}>
                              <SortableContext items={(day.tasks ?? []).map((t) => t.id)} strategy={verticalListSortingStrategy}>
                                {(day.tasks ?? []).map((task) => <SortableTaskRow key={task.id} task={task} onEdit={() => setEditingTask({ phaseId: phase.id, dayId: day.id, task })} onDelete={() => delTask(phase.id, day.id, task.id)} />)}
                              </SortableContext>
                            </DndContext>
                            <button type="button" onClick={() => { setAddTaskTarget({ phaseId: phase.id, dayId: day.id }); setAddTaskMode("new"); setAddTaskQuery(""); setExerciseResults([]); }} className="text-xs text-primary-400">+ Ejercicio</button>
                          </div> : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs"><button type="button" onClick={() => addDay(phase.id)} className="text-primary-400">+ DÃ­a</button><select onChange={(e) => { if (e.target.value) linkDay(phase.id, e.target.value); e.target.value = ""; }} defaultValue="" className="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-300"><option value="">Vincular dÃ­a existenteâ€¦</option>{allDays.map((d) => <option key={d.dayId} value={d.dayId}>{d.phaseName} / {d.label}</option>)}</select></div>
                </div> : null}
              </div>
            );
          })}
          <p className="text-xs text-surface-500">2B-lite: los coaches editan ejercicios/prescripciones del programa (no el catÃ¡logo global `Exercise`). VinculÃ¡ un ejercicio global para habilitar carga/historial. DnD mÃ³vil: `@dnd-kit` touch/pointer. Subida S3/MinIO por ejercicio: <code>POST /coach/program-templates/:id/tasks/:taskId/media</code>.</p>
        </section>
      )}

            {editingDay ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingDay(null)}><div className="w-full max-w-md rounded-xl bg-surface-900 p-4" onClick={(e) => e.stopPropagation()}><h4 className="font-semibold text-surface-100">Editar dÃ­a</h4><label className="mt-2 block text-xs text-surface-400">TÃ­tulo<input defaultValue={editingDay.day.title ?? ""} onBlur={(e) => saveDay(editingDay.phaseId, editingDay.day.id, { title: e.target.value || null })} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /></label><label className="mt-2 block text-xs text-surface-400">Tipo / dÃ­a de descanso<select defaultValue={editingDay.day.dayType} onChange={(e) => saveDay(editingDay.phaseId, editingDay.day.id, { dayType: e.target.value as DayType })} className="mt-1 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100">{DAY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label><div className="mt-4 flex justify-between"><button type="button" onClick={() => { delDay(editingDay.phaseId, editingDay.day.id); setEditingDay(null); }} className="text-xs text-red-400">Eliminar dÃ­a</button><button type="button" onClick={() => setEditingDay(null)} className="rounded bg-surface-800 px-3 py-2 text-sm text-surface-100">Cerrar</button></div></div></div> : null}

      {addTaskTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAddTaskTarget(null)}><div className="w-full max-w-lg rounded-xl bg-surface-900 p-4" onClick={(e) => e.stopPropagation()}><h4 className="font-semibold text-surface-100">Agregar ejercicio</h4><div className="mt-2 flex gap-2 text-xs"><button type="button" onClick={() => setAddTaskMode("new")} className={`rounded px-2 py-1 ${addTaskMode === "new" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Nuevo (catÃ¡logo / ejercicio propio)</button><button type="button" onClick={() => setAddTaskMode("program")} className={`rounded px-2 py-1 ${addTaskMode === "program" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Del programa</button></div>
        {addTaskMode === "new" ? <><input value={addTaskQuery} onChange={(e) => setAddTaskQuery(e.target.value)} placeholder="Buscar nombre en catÃ¡logo (opcional)â€¦" className="mt-2 w-full rounded border border-surface-700 bg-surface-950 px-2 py-1.5 text-sm text-surface-100" /><div className="mt-2 max-h-40 overflow-y-auto">{exerciseResults.slice(0, 15).map((ex) => <button key={ex.id} type="button" onClick={() => { createTask(addTaskTarget.phaseId, addTaskTarget.dayId, ex); setAddTaskTarget(null); }} className="block w-full rounded px-2 py-1 text-left text-sm text-surface-200 hover:bg-surface-800">{ex.name} <span className="text-xs text-surface-500">Â· {ex.category}</span></button>)}<button type="button" onClick={() => { createTask(addTaskTarget.phaseId, addTaskTarget.dayId); setAddTaskTarget(null); }} className="mt-1 block w-full rounded bg-surface-800 px-2 py-2 text-left text-sm text-surface-100">+ Crear ejercicio nuevo del programa (sin vÃ­nculo global)</button></div></>
        : <div className="mt-2 max-h-48 overflow-y-auto text-sm">{allDays.map((d) => <div key={d.dayId} className="mb-2"><p className="text-xs text-surface-500">{d.phaseName} / {d.label}</p>{d.tasks.map((tk) => <button key={tk.id} type="button" onClick={() => { copyTask(addTaskTarget.phaseId, addTaskTarget.dayId, tk.id); setAddTaskTarget(null); }} className="block w-full rounded px-2 py-1 text-left text-surface-200 hover:bg-surface-800">{tk.name}</button>)}</div>)}</div>}
        <div className="mt-3 text-right"><button type="button" onClick={() => setAddTaskTarget(null)} className="rounded bg-surface-800 px-3 py-2 text-sm text-surface-100">Cerrar</button></div></div></div> : null}

      {confirmDeletePhase ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDeletePhase(null)}><div className="w-full max-w-sm rounded-xl bg-surface-900 p-4" onClick={(e) => e.stopPropagation()}><h4 className="font-semibold text-surface-100">Eliminar fase</h4><p className="mt-2 text-sm text-surface-300">Â¿Eliminar <span className="font-medium text-surface-100">{confirmDeletePhase.name}</span>? Se eliminarÃ¡n sus dÃ­as y ejercicios del programa.</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDeletePhase(null)} className="rounded bg-surface-800 px-3 py-2 text-sm text-surface-200">Cancelar</button><button type="button" onClick={() => { delPhase(confirmDeletePhase.id); setConfirmDeletePhase(null); if (editingPhase?.id === confirmDeletePhase.id) { setEditingPhase(null); setPhaseEditDraft(null); } }} className="rounded bg-red-600 px-3 py-2 text-sm text-white">Eliminar</button></div></div></div> : null}

      {editingTask ? <TaskEditorModal task={editingTask.task} allDays={allDays} exerciseResults={exerciseResults} onSearch={searchExercises} onClose={() => setEditingTask(null)} onPickExercise={(ex) => setEditingTask((p) => p ? ({ ...p, task: { ...p.task, exerciseId: ex.id, exercise: { id: ex.id, name: ex.name, slug: ex.slug, category: ex.category }, name: p.task.name || ex.name, category: ex.category ?? p.task.category ?? null, equipment: ex.equipment ?? p.task.equipment ?? null, evolutionGoals: toGoals(p.task), isBlock: Boolean(p.task.isBlock) } }) : p)} onCopyFrom={(src) => setEditingTask((p) => p ? ({ ...p, task: { ...p.task, name: src.name, category: src.category ?? null, equipment: src.equipment ?? null, sets: src.sets, repsOrTimeText: src.repsOrTimeText, description: src.description, requiresWeight: src.requiresWeight, isUnilateral: src.isUnilateral, evolution: src.evolution, evolutionGoals: toGoals(src), zone: src.zone, videoUrl: src.videoUrl, isBlock: Boolean(src.isBlock), blockItems: src.blockItems, exerciseId: src.exerciseId, exercise: src.exercise ?? null, sourceTaskId: src.id } }) : p)} onSave={(patch) => { const { exercise, variants, ...rest } = patch as any; saveTask(editingTask.phaseId, editingTask.dayId, editingTask.task.id, rest); setEditingTask(null); }} /> : null}
      {preview ? <PreviewModal phases={phases} onClose={() => setPreview(false)} /> : null}
    </div>
  );
}

