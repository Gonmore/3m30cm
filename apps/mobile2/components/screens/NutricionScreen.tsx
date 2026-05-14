import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme } from "@mobile/components/ThemeContext";
import { R, S } from "@mobile/components/tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NutritionArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  icon: string;
  orderIndex: number;
}

interface NutritionTip {
  id: string;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; emoji: string }> = {
  PRE_WORKOUT:  { label: "Pre-entrenamiento", color: "#FF8C42", emoji: "⚡" },
  POST_WORKOUT: { label: "Post-entrenamiento", color: "#4CAF7D", emoji: "🔄" },
  REST_DAY:     { label: "Día de descanso",   color: "#5B8EE6", emoji: "😴" },
  COMPETITION:  { label: "Competencia",       color: "#E040FB", emoji: "🏆" },
  SUPPLEMENTS:  { label: "Suplementos",       color: "#F9A825", emoji: "💊" },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META);

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  accessToken: string | null;
  apiBaseUrl: string;
}

export default function NutricionScreen({ accessToken, apiBaseUrl }: Props) {
  const { C } = useTheme();
  const styles = makeStyles(C);

  const [articles, setArticles] = useState<NutritionArticle[]>([]);
  const [tip, setTip] = useState<NutritionTip | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("PRE_WORKOUT");
  const [openArticle, setOpenArticle] = useState<NutritionArticle | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function loadData() {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [artRes, tipRes] = await Promise.all([
        fetch(`${apiBaseUrl}/nutrition/articles`, { headers }).then((r) => r.json() as Promise<{ articles: NutritionArticle[] }>),
        fetch(`${apiBaseUrl}/nutrition/tips/random`, { headers }).then((r) => r.json() as Promise<{ tip: NutritionTip | null }>),
      ]);
      setArticles(artRes.articles ?? []);
      setTip(tipRes.tip ?? null);
    } finally {
      setLoading(false);
    }
  }

  const filtered = articles.filter((a) => a.category === selectedCategory);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Tip del día ─────────────────────────────────────── */}
        {tip ? (
          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>💡 Tip del día</Text>
            <Text style={styles.tipMessage}>{tip.message}</Text>
          </View>
        ) : null}

        {/* ── Category pills ──────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillRow}
          contentContainerStyle={styles.pillContent}
        >
          {ALL_CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                style={[styles.pill, active && { backgroundColor: meta?.color ?? C.accent }]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={styles.pillEmoji}>{meta?.emoji}</Text>
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                  {meta?.label ?? cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Article cards ───────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No hay artículos en esta categoría.</Text>
          </View>
        ) : (
          filtered.map((article) => (
            <Pressable
              key={article.id}
              style={styles.card}
              onPress={() => setOpenArticle(article)}
            >
              <Text style={styles.cardIcon}>{article.icon}</Text>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{article.title}</Text>
                <Text style={styles.cardCategory}>
                  {CATEGORY_META[article.category]?.label ?? article.category}
                </Text>
              </View>
              <Text style={styles.cardChevron}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* ── Article detail modal ────────────────────────────── */}
      <Modal
        visible={openArticle !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setOpenArticle(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>{openArticle?.icon}</Text>
              <Text style={styles.modalTitle} numberOfLines={2}>{openArticle?.title}</Text>
              <Pressable style={styles.modalClose} onPress={() => setOpenArticle(null)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalContent}>{openArticle?.content}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStyles(C: Record<string, any>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
    scroll: { paddingHorizontal: S.md, paddingBottom: S.xl },

    // Tip
    tipCard: {
      marginTop: S.lg,
      backgroundColor: C.card ?? C.surface,
      borderRadius: R.lg,
      padding: S.md,
      borderLeftWidth: 4,
      borderLeftColor: C.accent,
      elevation: 2,
    },
    tipLabel: { fontSize: 12, fontWeight: "700", color: C.accent, marginBottom: S.xs },
    tipMessage: { fontSize: 14, color: C.text, lineHeight: 20 },

    // Category pills
    pillRow: { marginTop: S.lg, marginBottom: S.md },
    pillContent: { paddingHorizontal: 4, gap: S.sm },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: S.md,
      paddingVertical: S.xs,
      borderRadius: R.full ?? 100,
      backgroundColor: C.surface ?? C.card,
      borderWidth: 1,
      borderColor: C.border ?? "transparent",
      gap: 4,
    },
    pillEmoji: { fontSize: 14 },
    pillLabel: { fontSize: 13, color: C.textSecondary ?? C.text },
    pillLabelActive: { color: "#fff", fontWeight: "700" },

    // Cards
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.card ?? C.surface,
      borderRadius: R.lg,
      padding: S.md,
      marginBottom: S.sm,
      elevation: 1,
    },
    cardIcon: { fontSize: 28, marginRight: S.md },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: "600", color: C.text, marginBottom: 2 },
    cardCategory: { fontSize: 12, color: C.textSecondary ?? C.text },
    cardChevron: { fontSize: 24, color: C.textSecondary ?? C.text, marginLeft: S.sm },

    // Empty
    emptyBox: { alignItems: "center", marginTop: S.xl },
    emptyText: { color: C.textSecondary ?? C.text, fontSize: 14 },

    // Modal
    modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    modalSheet: {
      backgroundColor: C.bg,
      borderTopLeftRadius: R.xl ?? 24,
      borderTopRightRadius: R.xl ?? 24,
      maxHeight: "85%",
      paddingBottom: S.xl,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: S.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border ?? "#2a2a2a",
      gap: S.sm,
    },
    modalIcon: { fontSize: 28 },
    modalTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: C.text },
    modalClose: { padding: S.xs },
    modalCloseText: { fontSize: 18, color: C.textSecondary ?? C.text },
    modalScroll: { padding: S.md },
    modalContent: { fontSize: 14, color: C.text, lineHeight: 22 },
  });
}
