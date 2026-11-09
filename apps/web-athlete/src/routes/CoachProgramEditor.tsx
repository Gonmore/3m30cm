import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApi, handleApiResponse } from "../api/client";
import type { CoachTemplateDetail, DayType, ExerciseTaskTemplate, ProgramPhaseDayTemplate, ProgramPhaseTemplate } from "../types/api";

type ExercisePick = { id: string; name: string; slug: string; category: string };

function moneyInputToCents(value: string) {
  const n = Number(String(value).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export default function CoachProgramEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "nuevo";
  const api = useApi();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<CoachTemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [usesPhases, setUsesPhases] = useState(false);
  const [cycleLengthDays, setCycleLengthDays] = useState(14);
  const [phaseName, setPhaseName] = useState("Fase 1");
  const [phaseDuration, setPhaseDuration] = useState(14);
  const [masterBlockDays, setMasterBlockDays] = useState<7 | 14>(7);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [exerciseResults, setExerciseResults] = useState<ExercisePick[]>([]);

  const load = async (templateId: string) => {
    const res = await api(`/coach/program-templates/${templateId}`);
    const data = await handleApiResponse<{ template: CoachTemplateDetail }>(res);
    const t = data.template;
    setTemplate(t);
    setName(t.name ?? ""); setCode(t.code ?? ""); setObjective(t.objective ?? ""); setDescription(t.description ?? "");
    setIsPremium(Boolean(t.isPremium)); setPrice(t.displayPriceCents != null ? String(t.displayPriceCents / 100) : ""); setCurrency(t.currency || "ARS");
    setUsesPhases(Boolean(t.usesPhases)); setCycleLengthDays(t.cycleLengthDays ?? 14);
  };

  useEffect(() => {
    if (!isNew && id) void load(id).catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!exerciseQuery.trim()) { setExerciseResults([]); return; }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await api(`/coach/exercises?q=${encodeURIComponent(exerciseQuery.trim())}`);
          const data = await handleApiResponse<{ exercises: ExercisePick[] }>(res);
          setExerciseResults(data.exercises ?? []);
        } catch { /* ignore */ }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [api, exerciseQuery]);

  const saveBase = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const body = { name, code: code || undefined, objective: objective || null, description: description || null, isPremium, displayPriceCents: moneyInputToCents(price), currency, usesPhases, cycleLengthDays };
      if (isNew) {
        const res = await api("/coach/program-templates", { method: "POST", body: JSON.stringify(body) });
        const data = await handleApiResponse<{ template: CoachTemplateDetail }>(res);
        navigate(`/coach/programas/${data.template.id}`, { replace: true });
      } else if (id) {
        const res = await api(`/coach/program-templates/${id}`, { method: "PUT", body: JSON.stringify(body) });
        await handleApiResponse(res);
        await load(id);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Error al guardar"); }
    finally { setSaving(false); }
  };

  const apiMutate = async (path: string, method: string, body?: unknown) => {
    if (!id) return;
    setError(null);
    try {
      const res = await api(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const data = await handleApiResponse<{ phases?: ProgramPhaseTemplate[] }>(res);
      if (data.phases) setTemplate((prev) => (prev ? { ...prev, phases: data.phases ?? [] } : prev));
      else await load(id);
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  const addPhase = () => void apiMutate(`/coach/program-templates/${id}/phases`, "POST", { name: phaseName, durationDays: phaseDuration, masterBlockDays, orderIndex: (template?.phases?.length ?? 0) + 1 });
  const addDay = (phaseId: string, dayNumber: number) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days`, "POST", { dayNumber, title: `Día ${dayNumber}`, dayType: "OTHER" as DayType });
  const addTask = (phaseId: string, dayId: string, ex?: ExercisePick) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks`, "POST", { name: ex?.name ?? "Nuevo ejercicio", exerciseId: ex?.id ?? null, requiresWeight: false, isUnilateral: false, evolution: "WEIGHT", zone: "FULL" });
  const updateTask = (phaseId: string, dayId: string, task: ExerciseTaskTemplate, patch: Partial<ExerciseTaskTemplate>) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks/${task.id}`, "PUT", patch);
  const deleteTask = (phaseId: string, dayId: string, taskId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}/tasks/${taskId}`, "DELETE");
  const deleteDay = (phaseId: string, dayId: string) => void apiMutate(`/coach/program-templates/${id}/phases/${phaseId}/days/${dayId}`, "DELETE");

  const phases = useMemo(() => template?.phases ?? [], [template]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-surface-100">{isNew ? "Nuevo programa" : "Editar programa"}</h2>
      {error ? <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div> : null}
      <form onSubmit={saveBase} className="space-y-3 rounded-lg bg-surface-900 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-surface-300">Nombre<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
          <label className="text-sm text-surface-300">Código<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AUTO si vacío" className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        </div>
        <label className="block text-sm text-surface-300">Objetivo<input value={objective} onChange={(e) => setObjective(e.target.value)} className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        <label className="block text-sm text-surface-300">Descripción<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm text-surface-300">Ciclo (días)<input type="number" min={1} value={cycleLengthDays} onChange={(e) => setCycleLengthDays(Number(e.target.value))} className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
          <label className="flex items-center gap-2 pt-6 text-sm text-surface-300"><input type="checkbox" checked={usesPhases} onChange={(e) => setUsesPhases(e.target.checked)} /> Usa fases</label>
          <label className="flex items-center gap-2 pt-6 text-sm text-surface-300"><input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} /> Premium</label>
          <label className="text-sm text-surface-300">Precio ({currency})<input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0 = sin publicar" className="mt-1 w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100" /></label>
        </div>
        <p className="text-xs text-surface-500">Aprobados: {template?.approvedAssignmentCount ?? 0} · Ingreso esperado (display): {template ? new Intl.NumberFormat("es-AR", { style: "currency", currency: template.currency || "ARS", maximumFractionDigits: 0 }).format((template.expectedRevenueCents ?? 0) / 100) : "—"}</p>
        <button disabled={saving} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : isNew ? "Crear programa" : "Guardar cambios"}</button>
      </form>

      {!isNew && id && (
        <section className="space-y-4 rounded-lg bg-surface-900 p-4">
          <h3 className="text-lg font-semibold text-surface-100">Estructura (fases/días/tareas)</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <input value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="Nombre fase" className="rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100" />
            <input type="number" min={1} value={phaseDuration} onChange={(e) => setPhaseDuration(Number(e.target.value))} className="rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100" />
            <select value={masterBlockDays} onChange={(e) => setMasterBlockDays(Number(e.target.value) as 7 | 14)} className="rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100"><option value={7}>Bloque 7</option><option value={14}>Bloque 14</option></select>
            <button onClick={addPhase} className="rounded-md bg-surface-800 px-3 py-2 text-sm text-surface-100">Agregar fase</button>
          </div>
          <div className="rounded-md border border-surface-800 p-3">
            <p className="mb-2 text-xs text-surface-500">Buscar ejercicio existente para asignar a tarea (solo lectura del catálogo global):</p>
            <input value={exerciseQuery} onChange={(e) => setExerciseQuery(e.target.value)} placeholder="Buscar ejercicio…" className="w-full rounded-md border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100" />
            {exerciseResults.length ? <div className="mt-2 flex flex-wrap gap-2">{exerciseResults.slice(0, 12).map((ex) => <span key={ex.id} className="rounded bg-surface-800 px-2 py-1 text-xs text-surface-300" title={ex.id}>{ex.name} · {ex.category}</span>)}</div> : null}
          </div>
          {phases.length === 0 ? <p className="text-sm text-surface-500">Sin fases. Agregá una fase para usar el editor por tareas (wizard).</p> : phases.map((phase: ProgramPhaseTemplate) => (
            <div key={phase.id} className="rounded-md border border-surface-800 p-3">
              <div className="flex items-center justify-between"><div><p className="font-medium text-surface-100">{phase.name}</p><p className="text-xs text-surface-500">Orden {phase.orderIndex} · {phase.durationDays} días · bloque {phase.masterBlockDays}</p></div><button onClick={() => void apiMutate(`/coach/program-templates/${id}/phases/${phase.id}`, "DELETE")} className="text-xs text-red-400">Eliminar fase</button></div>
              <div className="mt-3 space-y-3">
                {(phase.days ?? []).map((day: ProgramPhaseDayTemplate) => (
                  <div key={day.id} className="rounded bg-surface-950 p-3">
                    <div className="flex items-center justify-between"><p className="text-sm font-medium text-surface-200">Día {day.dayNumber}{day.title ? ` — ${day.title}` : ""} <span className="text-surface-500">({day.dayType})</span></p><div className="flex gap-2"><button onClick={() => addTask(phase.id, day.id)} className="text-xs text-primary-400">+ tarea</button><button onClick={() => deleteDay(phase.id, day.id)} className="text-xs text-red-400">Eliminar día</button></div></div>
                    <div className="mt-2 space-y-2">{(day.tasks ?? []).map((task) => (
                      <div key={task.id} className="rounded border border-surface-800 p-2 text-sm">
                        <div className="grid gap-2 sm:grid-cols-4">
                          <input defaultValue={task.name} onBlur={(e) => e.target.value !== task.name && updateTask(phase.id, day.id, task, { name: e.target.value })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-100" />
                          <input defaultValue={task.sets ?? ""} type="number" placeholder="sets" onBlur={(e) => updateTask(phase.id, day.id, task, { sets: e.target.value ? Number(e.target.value) : null })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-100" />
                          <input defaultValue={task.repsOrTimeText ?? ""} placeholder="reps/tiempo" onBlur={(e) => updateTask(phase.id, day.id, task, { repsOrTimeText: e.target.value || null })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-100" />
                          <button onClick={() => deleteTask(phase.id, day.id, task.id)} className="text-xs text-red-400">Eliminar</button>
                          <input defaultValue={task.videoUrl ?? ""} placeholder="YouTube/URL video o S3 asset" onBlur={(e) => updateTask(phase.id, day.id, task, { videoUrl: e.target.value || null })} className="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-100 sm:col-span-4" />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-surface-500"><span>{task.exerciseId ? `ejercicio vinculado: ${task.exercise?.name ?? task.exerciseId}` : "sin ejercicio global"}</span><span>evol: {task.evolution}</span><span>zona: {task.zone}</span></div>
                      </div>
                    ))}</div>
                  </div>
                ))}
                <button onClick={() => addDay(phase.id, (phase.days?.length ?? 0) + 1)} className="text-xs text-primary-400">+ día</button>
              </div>
            </div>
          ))}
          <p className="text-xs text-surface-500">Subida S3/MinIO de media por tarea: endpoint disponible en API (<code className="text-surface-400">POST /coach/program-templates/:id/tasks/:taskId/media</code>) con ownership; enlazar desde UI final según flujo de archivos.</p>
        </section>
      )}
    </div>
  );
}
