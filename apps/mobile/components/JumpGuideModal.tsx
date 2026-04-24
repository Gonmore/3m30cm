import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { R, S } from "./tokens";
import { useTheme } from "./ThemeContext";

interface JumpGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

const steps = [
  {
    num: "①",
    title: "Posición inicial",
    body: "Párate junto a una pared lisa. Pies planos a la altura de los hombros. Colócate de lado o de frente a la pared, lo que te permita marcar más cómodo.",
  },
  {
    num: "②",
    title: "Marca tu alcance parado (Altura A)",
    body: "Con el brazo dominante extendido completamente hacia arriba, toca la pared con los dedos y marca el punto más alto que alcanzas. Esa es tu Altura A.",
  },
  {
    num: "③",
    title: "Preparación CMJ",
    body: "Flexiona las rodillas a media sentadilla (≈ 90°), lleva los brazos hacia atrás y carga el movimiento. El contra-movimiento es lo que da potencia al salto.",
  },
  {
    num: "④",
    title: "¡Salta!",
    body: "Salta lo más alto que puedas y en el punto más alto toca la pared con los dedos. Marca ese punto, esa es tu Altura B.",
  },
  {
    num: "⑤",
    title: "Mide la diferencia",
    body: "Altura de salto = B − A (en centímetros). Ejemplo: A = 215 cm, B = 255 cm → salto = 40 cm. Eso es lo que registras en la app.",
  },
  {
    num: "⑥",
    title: "Repite 3 veces",
    body: "Descansa 60 segundos entre intentos. Registra los 3 valores. La app tomará el mejor como tu marca oficial y calculará el promedio.",
  },
];

export default function JumpGuideModal({ visible, onClose }: JumpGuideModalProps) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = makeStyles(C);
  const toneMap: Record<string, string> = {
    "①": C.amber,
    "②": C.amber,
    "③": C.teal,
    "④": C.teal,
    "⑤": C.amber,
    "⑥": C.teal,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.lg }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Cómo medir tu salto</Text>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.headerSub}>Método CMJ · Pared + cinta métrica</Text>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {steps.map((step) => {
              const accent = toneMap[step.num] ?? C.amber;
              return (
                <View key={step.num} style={[styles.stepCard, { borderLeftColor: accent }]}>
                  <View style={styles.stepTop}>
                    <Text style={[styles.stepNum, { color: accent }]}>{step.num}</Text>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                  </View>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              );
            })}

            {/* Tips card */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Consejos</Text>
              <Text style={styles.tipLine}>• Calienta 5 min antes de empezar los intentos.</Text>
              <Text style={styles.tipLine}>• Usa calzado deportivo de la misma suela siempre.</Text>
              <Text style={styles.tipLine}>• Descansa 60 s entre intentos para recuperar potencia.</Text>
              <Text style={styles.tipLine}>• Tiza o cinta de carrocero sobre la pared es suficiente.</Text>
              <Text style={styles.tipLine}>• Mide siempre en la misma pared y con el mismo brazo para comparar tus marcas.</Text>
            </View>

            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Errores que arruinan la medición</Text>
              <Text style={styles.tipLine}>• No registres el salto si flexionaste las piernas al tocar la marca.</Text>
              <Text style={styles.tipLine}>• No compares intentos hechos con distinto calentamiento o distinta técnica.</Text>
              <Text style={styles.tipLine}>• Si haces 3 intentos, registra el mejor como altura máxima y deja que la app calcule el promedio.</Text>
            </View>
          </ScrollView>

          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Entendido, ir a registrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    maxHeight: "92%",
    paddingTop: S.lg,
    paddingHorizontal: S.md,
    borderTopWidth: 1,
    borderTopColor: C.borderStrong,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: S.xs,
  },
  headerTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
  },
  headerSub: {
    color: C.textMuted,
    fontSize: 13,
    marginBottom: S.md,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: R.full,
    backgroundColor: C.surfaceRaise,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: C.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    gap: S.sm,
    paddingBottom: S.md,
  },
  stepCard: {
    backgroundColor: C.surfaceRaise,
    borderRadius: R.md,
    padding: S.md,
    borderLeftWidth: 3,
    gap: S.xs,
  },
  stepTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
  },
  stepNum: {
    fontSize: 20,
    fontWeight: "800",
    width: 28,
  },
  stepTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  stepBody: {
    color: C.textSub,
    fontSize: 14,
    lineHeight: 21,
    paddingLeft: 36,
  },
  tipsCard: {
    backgroundColor: C.amberDim,
    borderRadius: R.md,
    padding: S.md,
    gap: S.xs,
    borderWidth: 1,
    borderColor: C.amberBorder,
    marginTop: S.xs,
  },
  tipsTitle: {
    color: C.amber,
    fontWeight: "800",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: S.xs,
  },
  tipLine: {
    color: C.textSub,
    fontSize: 13,
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: C.tealDim,
    borderRadius: R.md,
    padding: S.md,
    gap: S.xs,
    borderWidth: 1,
    borderColor: C.tealBorder,
    marginTop: S.xs,
  },
  warningTitle: {
    color: C.teal,
    fontWeight: "800",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: S.xs,
  },
  doneBtn: {
    backgroundColor: C.amber,
    borderRadius: R.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: S.md,
  },
  doneBtnText: {
    color: C.bg,
    fontWeight: "800",
    fontSize: 15,
  },
});
}
