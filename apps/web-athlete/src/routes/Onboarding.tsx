import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { type AthleteProfile, type AvailableTemplate } from "../types/api";

interface OnboardingData {
  trainsSport: boolean;
  sportTrainingDays: number[];
  weekendGameDays: number[];
  heightCm: string;
  weightKg: string;
  notes: string;
}

interface AvailableProgramsResponse {
  templates: AvailableTemplate[];
  hasActiveProgram: boolean;
}

const weekdayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const weekdayFullNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function OnboardingFlow() {
  const api = useApi();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [templates, setTemplates] = useState<AvailableTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>("");
  const [data, setData] = useState<OnboardingData>({
    trainsSport: false,
    sportTrainingDays: [],
    weekendGameDays: [],
    heightCm: "",
    weightKg: "",
    notes: "",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const [meRes, availableRes] = await Promise.all([
          api("/athlete/me"),
          api("/athlete/programs/available"),
        ]);
        const meData = await handleApiResponse<{ athleteProfile: AthleteProfile | null }>(meRes);
        const availableData = await handleApiResponse<AvailableProgramsResponse>(availableRes);
        setProfile(meData.athleteProfile);
        setTemplates(availableData.templates ?? []);

        if (meData.athleteProfile?.onboardingCompletedAt) {
          navigate("/", { replace: true });
        }

        const freeTemplates = (availableData.templates ?? []).filter((t) => !t.isPremium);
        if (freeTemplates.length > 0 && !selectedTemplateCode) {
          setSelectedTemplateCode(freeTemplates[0]?.code ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar perfil");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchProfile();
  }, [api, navigate]);

  const toggleDay = (day: number, field: "sportTrainingDays" | "weekendGameDays") => {
    setData((prev) => {
      const current = prev[field];
      const updated = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      return { ...prev, [field]: updated };
    });
  };

  const handleSaveAndGenerate = async () => {
    if (!selectedTemplateCode) {
      setError("Seleccioná un programa");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      // Step 1: Save onboarding profile
      const onboardingPayload: Record<string, unknown> = {
        displayName: profile?.displayName ?? null,
        heightCm: data.heightCm ? parseInt(data.heightCm, 10) : 0,
        weightKg: data.weightKg ? parseFloat(data.weightKg) : 0,
        sport: profile?.sport ?? "otro",
        trainsSport: data.trainsSport,
        sportTrainingDays: JSON.stringify(data.sportTrainingDays),
        weeklyGameCount: data.trainsSport
          ? data.weekendGameDays.length <= 1
            ? "ZERO_TO_ONE"
            : data.weekendGameDays.length <= 3
              ? "TWO_TO_THREE"
              : "FOUR_PLUS"
          : "ZERO_TO_ONE",
        teamTrainingIntensity: data.trainsSport ? "LIGHT" : "NONE",
        availableWeekdays: JSON.stringify([1, 2, 3, 4, 5]),
        programPreferences: JSON.stringify({
          skipPhase1: false,
          teamTrainingDays: data.sportTrainingDays,
          deloadEnabled: false,
        }),
        notes: data.notes || null,
      };

      const onboardingRes = await api("/athlete/onboarding", {
        method: "PUT",
        body: JSON.stringify(onboardingPayload),
      });
      await handleApiResponse<unknown>(onboardingRes);

      // Step 2: Generate program
      const today = new Date();
      const startDate = today.toISOString().split("T")[0];

      const generatePayload: Record<string, unknown> = {
        templateCode: selectedTemplateCode,
        startDate,
        trainsSport: data.trainsSport,
        sportTrainingDays: JSON.stringify(data.sportTrainingDays),
        availableWeekdays: JSON.stringify([1, 2, 3, 4, 5]),
        weeklyGameCount: data.trainsSport
          ? data.weekendGameDays.length <= 1
            ? "ZERO_TO_ONE"
            : data.weekendGameDays.length <= 3
              ? "TWO_TO_THREE"
              : "FOUR_PLUS"
          : "ZERO_TO_ONE",
        teamTrainingIntensity: data.trainsSport ? "LIGHT" : "NONE",
        programPreferences: JSON.stringify({
          skipPhase1: false,
          teamTrainingDays: data.sportTrainingDays,
          deloadEnabled: false,
        }),
      };

      const generateRes = await api("/athlete/programs/generate", {
        method: "POST",
        body: JSON.stringify(generatePayload),
      });
      await handleApiResponse<unknown>(generateRes);

      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar y generar programa");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-surface-400">Cargando…</div>
      </div>
    );
  }

  const totalSteps = 4;

  const renderStepIndicator = () => (
    <div className="mb-6 flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-8 rounded-full transition-colors ${
            i === step ? "bg-primary-500" : "bg-surface-700"
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      {renderStepIndicator()}

      {error && (
        <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Step 0: ¿Hace deporte? */}
      {step === 0 && (
        <div>
          <h3 className="mb-4 text-xl font-bold text-surface-100">¿Entrenas deporte además de saltar?</h3>
          <p className="mb-4 text-sm text-surface-400">
            Si entrenas deporte, reduciremos la carga los días en que competís.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setData((prev) => ({ ...prev, trainsSport: true }));
                setStep(step + 1);
              }}
              className={`w-full rounded-md border py-3 px-4 text-left transition-colors ${
                data.trainsSport
                  ? "border-primary-500 bg-primary-900/20 text-primary-400"
                  : "border-surface-700 text-surface-300 hover:border-surface-600"
              }`}
            >
              Sí, entreno deporte
            </button>
            <button
              onClick={() => {
                setData((prev) => ({ ...prev, trainsSport: false, sportTrainingDays: [], weekendGameDays: [] }));
                setStep(step + 1);
              }}
              className={`w-full rounded-md border py-3 px-4 text-left transition-colors ${
                !data.trainsSport
                  ? "border-primary-500 bg-primary-900/20 text-primary-400"
                  : "border-surface-700 text-surface-300 hover:border-surface-600"
              }`}
            >
              No, solo salto
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Días de entrenamiento + competencia (solo si hace deporte) */}
      {step === 1 && data.trainsSport && (
        <div>
          <h3 className="mb-2 text-xl font-bold text-surface-100">Días de entrenamiento deportivo</h3>
          <p className="mb-4 text-sm text-surface-400">Seleccioná los días en los que vas a entrenar deporte</p>
          <div className="grid grid-cols-7 gap-1.5">
            {weekdayNames.map((name, i) => {
              const isSelected = data.sportTrainingDays.includes(i);
              return (
                <button
                  key={name}
                  onClick={() => toggleDay(i, "sportTrainingDays")}
                  className={`rounded-md border py-2 text-center text-xs transition-colors ${
                    isSelected
                      ? "border-primary-500 bg-primary-900/20 text-primary-400"
                      : "border-surface-700 text-surface-400 hover:border-surface-600"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <h3 className="mt-6 mb-2 text-xl font-bold text-surface-100">¿Qué días competís?</h3>
          <p className="mb-4 text-sm text-surface-400">Seleccioná los días en los que jugás partidos</p>
          <div className="grid grid-cols-7 gap-1.5">
            {weekdayNames.map((name, i) => {
              const isSelected = data.weekendGameDays.includes(i);
              return (
                <button
                  key={name}
                  onClick={() => toggleDay(i, "weekendGameDays")}
                  className={`rounded-md border py-2 text-center text-xs transition-colors ${
                    isSelected
                      ? "border-primary-500 bg-primary-900/20 text-primary-400"
                      : "border-surface-700 text-surface-400 hover:border-surface-600"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 rounded-md bg-primary-600 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 1 (alt): Si no entrena deporte, saltamos a medidas */}
      {step === 1 && !data.trainsSport && (
        <div>
          <h3 className="mb-4 text-xl font-bold text-surface-100">¿Cuántos días por semana vas a entrenar?</h3>
          <p className="mb-4 text-sm text-surface-400">
            {weekdayFullNames
              .filter((_, i) => ![0, 6].includes(i))
              .map((d, i) => `${d.substring(0, 3)}`)
              .join(", ")}
          </p>
          <div className="space-y-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => {
                  const days = [1, 3, 5].slice(0, n) as [number, number] | [number, number, number];
                  setData((prev) => ({ ...prev, sportTrainingDays: days }));
                  setStep(step + 1);
                }}
                className="w-full rounded-md border border-surface-700 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
              >
                {n} días de entrenamiento
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Medidas */}
      {step === 2 && (
        <div>
          <h3 className="mb-4 text-xl font-bold text-surface-100">Tus medidas</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-300">Altura (cm)</label>
              <input
                type="number"
                value={data.heightCm}
                onChange={(e) => setData((prev) => ({ ...prev, heightCm: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                placeholder="170"
                min="100"
                max="260"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300">Peso (kg)</label>
              <input
                type="number"
                value={data.weightKg}
                onChange={(e) => setData((prev) => ({ ...prev, weightKg: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                placeholder="65"
                min="25"
                max="300"
                required
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(step + 1)}
              disabled={!data.heightCm || !data.weightKg}
              className="flex-1 rounded-md bg-primary-600 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Select program */}
      {step === 3 && (
        <div>
          <h3 className="mb-4 text-xl font-bold text-surface-100">Seleccioná un programa</h3>
          <div className="space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplateCode(template.code)}
                className={`w-full rounded-md border p-4 text-left transition-colors ${
                  selectedTemplateCode === template.code
                    ? "border-primary-500 bg-primary-900/20"
                    : "border-surface-700 hover:border-surface-600"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-surface-100">{template.name}</h4>
                    <p className="mt-1 text-sm text-surface-400">
                      {template.description || "Sin descripción"}
                    </p>
                    <p className="mt-1 text-xs text-surface-500">
                      {template.cycleLengthDays} días · {template.isPremium ? "Premium" : "Base"}
                    </p>
                  </div>
                  {template.isPremium && (
                    <span className="rounded-full bg-amber-900/20 px-2 py-0.5 text-xs text-amber-400">
                      Premium
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
            >
              Atrás
            </button>
            <button
              onClick={handleSaveAndGenerate}
              disabled={isSaving || !selectedTemplateCode}
              className="flex-1 rounded-md bg-primary-600 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {isSaving ? "Generando…" : "Guardar y generar programa"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
