import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { R, S } from "../tokens";
import { useTheme } from "../ThemeContext";
import type { ActiveProgram, AthleteProgress, ProgramSummary, SessionSummary } from "../types";

const STATUS_LABEL: Record<string, string> = {
  COMPLETED:   "✓  Completada",
  PLANNED:     "◎  Programada",
  SKIPPED:     "—  Saltada",
  RESCHEDULED: "↺  Reprogramada",
};

function formatDate(v: string) { return new Date(v).toLocaleDateString(); }

interface ProgramaScreenProps {
  activeProgram: ActiveProgram | null;
  programs: ProgramSummary[];
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  progress: AthleteProgress | null;
  loading: boolean;
  refreshing: boolean;
  onSelectSession: (id: string) => void;
  onPreviewSession: (id: string) => void;
  onPreloadSession: (id: string, title: string) => void;
  cachedSessionIds: string[];
  preloadSessionId: string | null;
  onRegenerateProgram: () => void;
  onRefresh: () => void;
}

export default function ProgramaScreen({
  activeProgram,
  programs,
  sessions,
  selectedSessionId,
  progress,
  loading,
  refreshing,
  onSelectSession,
  onPreviewSession,
  onPreloadSession,
  cachedSessionIds,
  preloadSessionId,
  onRegenerateProgram,
  onRefresh,
}: ProgramaScreenProps) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [pendingPreviewSession, setPendingPreviewSession] = useState<SessionSummary | null>(null);
  const cycleLabel = activeProgram
    ? `${activeProgram.name}  ·  ${activeProgram.phase}  ·  ${activeProgram.status}`
    : null;

  const completedCount = sessions.filter((s) => s.status === "COMPLETED").length;
  const scheduledCount = sessions.filter((s) => s.status === "PLANNED").length;
  const missedCount    = sessions.filter((s) => s.status === "SKIPPED").length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Program header card ──────────────────────────── */}
      {activeProgram ? (
        <View style={styles.progCard}>
          <Text style={styles.progEyebrow}>▤ PROGRAMA ACTIVO</Text>
          <Text style={styles.progTitle}>{activeProgram.name}</Text>
          <Text style={styles.progMeta}>
            {[
              activeProgram.phase,
              activeProgram.status,
              activeProgram.startDate && `Inicio ${formatDate(activeProgram.startDate)}`,
            ].filter(Boolean).join("  ·  ")}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: C.teal }]}>{completedCount}</Text>
              <Text style={styles.statLabel}>completadas</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: C.amber }]}>{scheduledCount}</Text>
              <Text style={styles.statLabel}>programadas</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: C.danger }]}>{missedCount}</Text>
              <Text style={styles.statLabel}>perdidas</Text>
            </View>
          </View>

          {cycleLabel ? (
            <View style={styles.cycleChip}>
              <Text style={styles.cycleChipText}>{cycleLabel}</Text>
            </View>
          ) : null}

          <View style={styles.cardActionsRow}>
            <Pressable style={styles.secondaryActionBtn} onPress={onRegenerateProgram} disabled={loading}>
              <Text style={styles.secondaryActionBtnText}>{loading ? "Regenerando…" : "↺ Regenerar programa"}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.noProgramCard}>
          <Text style={styles.noProgramIcon}>▤</Text>
          <Text style={styles.noProgramTitle}>Sin programa activo</Text>
          <Text style={styles.noProgramSub}>Volvé a Hoy y generá tu bloque de entrenamiento.</Text>
          <Pressable style={styles.secondaryActionBtn} onPress={onRegenerateProgram} disabled={loading}>
            <Text style={styles.secondaryActionBtnText}>{loading ? "Generando…" : "◎ Generar / regenerar"}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Sessions list ────────────────────────────────── */}
      {sessions.length > 0 ? (
        <View style={styles.sessionsList}>
          <Text style={styles.sectionTitle}>Sesiones</Text>
          {sessions.map((s) => {
            const color = {
              COMPLETED: C.teal,
              PLANNED: C.amber,
              SKIPPED: C.textMuted,
              RESCHEDULED: C.textSub,
            }[s.status ?? "available"] ?? C.textMuted;
            const isActive = s.id === selectedSessionId;
            const isCached = cachedSessionIds.includes(s.id);
            return (
              <Pressable
                key={s.id}
                style={[styles.sessionRow, isActive && styles.sessionRowActive]}
                onPress={() => {
                  onSelectSession(s.id);
                  setPendingPreviewSession(s);
                }}
              >
                <View style={[styles.sessionDot, { backgroundColor: color }]} />
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName}>{s.title}</Text>
                  <Text style={styles.sessionMeta}>
                    {s.scheduledDate ? formatDate(s.scheduledDate) : "Sin fecha"}
                    {"  ·  "}{STATUS_LABEL[s.status ?? "available"] ?? s.status}
                  </Text>
                  {isCached ? <Text style={styles.sessionOfflineTag}>Lista offline</Text> : null}
                </View>
                {isActive ? (
                  <View style={styles.activeTag}>
                    <Text style={styles.activeTagText}>◎</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : activeProgram ? (
        <View style={styles.noSessions}>
          <Text style={styles.noSessionsText}>No hay sesiones cargadas todavía.</Text>
        </View>
      ) : null}

      {/* ── All programs ─────────────────────────────────── */}
      {programs.length > 1 ? (
        <View style={styles.allPrograms}>
          <Text style={styles.sectionTitle}>Historial de programas</Text>
          {programs.map((p) => (
            <View key={p.id} style={styles.progHistRow}>
              <View style={[styles.progHistDot, { backgroundColor: p.status === "ACTIVE" ? C.amber : C.textMuted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.progHistName}>{p.name}</Text>
                <Text style={styles.progHistMeta}>
                  {[p.template?.name, p.phase, p.status].filter(Boolean).join("  ·  ")}
                </Text>
              </View>
              {p.status === "ACTIVE" ? <Text style={styles.activeLabel}>Activo</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.refreshBtn} onPress={onRefresh} disabled={refreshing}>
        <Text style={styles.refreshBtnText}>{refreshing ? "Actualizando…" : "↻ Actualizar"}</Text>
      </Pressable>

      <Modal visible={Boolean(pendingPreviewSession)} transparent animationType="fade" onRequestClose={() => setPendingPreviewSession(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>Desarrollo</Text>
            <Text style={styles.modalTitle}>{pendingPreviewSession?.title ?? "Ver sesión"}</Text>
            <Text style={styles.modalText}>¿Quieres abrir esta sesión y simularla desde el ejercicio 1?</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalGhostBtn} onPress={() => setPendingPreviewSession(null)}>
                <Text style={styles.modalGhostBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.modalGhostBtn}
                onPress={() => {
                  if (pendingPreviewSession) {
                    onPreloadSession(pendingPreviewSession.id, pendingPreviewSession.title);
                  }
                  setPendingPreviewSession(null);
                }}
                disabled={preloadSessionId === pendingPreviewSession?.id}
              >
                <Text style={styles.modalGhostBtnText}>
                  {preloadSessionId === pendingPreviewSession?.id
                    ? "Precargando..."
                    : pendingPreviewSession && cachedSessionIds.includes(pendingPreviewSession.id)
                      ? "Lista offline"
                      : "Pre cargar sesión"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={() => {
                  if (pendingPreviewSession) {
                    onPreviewSession(pendingPreviewSession.id);
                  }
                  setPendingPreviewSession(null);
                }}
              >
                <Text style={styles.modalPrimaryBtnText}>Ver sesión</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
return StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  container: { padding: S.md, gap: S.md, paddingBottom: S.xl },

  // Program card
  progCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  progEyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4 },
  progTitle: { color: C.text, fontWeight: "800", fontSize: 24 },
  progMeta: { color: C.textMuted, fontSize: 13 },
  statsRow: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  statBox: { flex: 1, backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.sm, alignItems: "center", gap: 2 },
  statVal: { fontSize: 22, fontWeight: "800" },
  statLabel: { color: C.textMuted, fontSize: 11 },
  cycleChip: { alignSelf: "flex-start", backgroundColor: C.amberDim, borderRadius: R.full, paddingHorizontal: S.sm, paddingVertical: 4, borderWidth: 1, borderColor: C.amberBorder },
  cycleChipText: { color: C.amber, fontWeight: "700", fontSize: 12 },
  cardActionsRow: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  secondaryActionBtn: { alignSelf: "flex-start", backgroundColor: C.surfaceRaise, borderRadius: R.full, paddingVertical: 11, paddingHorizontal: S.md, borderWidth: 1, borderColor: C.borderStrong },
  secondaryActionBtnText: { color: C.text, fontWeight: "700", fontSize: 13 },

  // No program
  noProgramCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.xl, gap: S.sm, alignItems: "center", borderWidth: 1, borderColor: C.border },
  noProgramIcon: { fontSize: 40, color: C.textMuted },
  noProgramTitle: { color: C.text, fontWeight: "800", fontSize: 18 },
  noProgramSub: { color: C.textSub, fontSize: 13, textAlign: "center" },

  // Sessions list
  sessionsList: { gap: S.xs },
  sectionTitle: { color: C.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", paddingHorizontal: 2 },
  sessionRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
  sessionRowActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
  sessionDot: { width: 8, height: 8, borderRadius: R.full, flexShrink: 0 },
  sessionInfo: { flex: 1 },
  sessionName: { color: C.text, fontWeight: "700", fontSize: 15 },
  sessionMeta: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  sessionOfflineTag: { color: C.teal, fontSize: 11, fontWeight: "800", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  activeTag: { backgroundColor: C.amberDim, borderRadius: R.full, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  activeTagText: { color: C.amber, fontWeight: "800", fontSize: 14 },
  noSessions: { padding: S.md },
  noSessionsText: { color: C.textMuted, fontSize: 13 },

  // History
  allPrograms: { gap: S.xs },
  progHistRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
  progHistDot: { width: 8, height: 8, borderRadius: R.full, flexShrink: 0 },
  progHistName: { color: C.text, fontWeight: "600", fontSize: 14 },
  progHistMeta: { color: C.textMuted, fontSize: 12 },
  activeLabel: { color: C.amber, fontWeight: "700", fontSize: 12 },

  refreshBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: S.md },
  refreshBtnText: { color: C.textMuted, fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: C.overlay, justifyContent: "center", padding: S.lg },
  modalCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.borderStrong },
  modalEyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2 },
  modalTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  modalText: { color: C.textSub, fontSize: 14, lineHeight: 20 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: S.sm, marginTop: S.xs, flexWrap: "wrap" },
  modalGhostBtn: { paddingVertical: 11, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong },
  modalGhostBtnText: { color: C.textSub, fontWeight: "700", fontSize: 13 },
  modalPrimaryBtn: { paddingVertical: 11, paddingHorizontal: S.md, borderRadius: R.full, backgroundColor: C.amber },
  modalPrimaryBtnText: { color: C.bg, fontWeight: "800", fontSize: 13 },
});
}
