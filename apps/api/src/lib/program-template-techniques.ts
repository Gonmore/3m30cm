import { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function ensureTemplateTechniqueStructure(db: DbClient, programTemplateId: string) {
  const template = await db.programTemplate.findUnique({
    where: { id: programTemplateId },
    include: {
      techniques: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        include: {
          mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
          measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
        },
      },
      techniqueMediaAssets: {
        where: { techniqueId: null },
        orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
      },
      techniqueMetrics: {
        where: { techniqueId: null },
        orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!template) {
    return null;
  }

  let primaryTechnique = template.techniques[0] ?? null;

  if (!primaryTechnique) {
    primaryTechnique = await db.programTemplateTechnique.create({
      data: {
        programTemplateId: template.id,
        title: template.techniqueTitle?.trim() || `${template.name} · Técnica base`,
        description: template.techniqueDescription ?? null,
        measurementInstructions: null,
        comparisonEnabled: false,
        orderIndex: 1,
      },
      include: {
        mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
        measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });
  }

  if (template.techniqueMediaAssets.length) {
    await db.programTemplateTechniqueAsset.updateMany({
      where: {
        programTemplateId: template.id,
        techniqueId: null,
      },
      data: { techniqueId: primaryTechnique.id },
    });
  }

  if (template.techniqueMetrics.length) {
    await db.athleteTechniqueMetric.updateMany({
      where: {
        programTemplateId: template.id,
        techniqueId: null,
      },
      data: { techniqueId: primaryTechnique.id },
    });

    const definitionKeys = new Map<string, string>();
    const existingDefinitions = await db.programTemplateTechniqueMeasurementDefinition.findMany({
      where: { techniqueId: primaryTechnique.id },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });

    for (const definition of existingDefinitions) {
      definitionKeys.set(definition.label.trim().toLowerCase(), definition.id);
    }

    const labels = Array.from(
      new Map(
        template.techniqueMetrics.map((metric) => [metric.label.trim().toLowerCase(), metric]),
      ).values(),
    );

    let nextOrderIndex = existingDefinitions.length + 1;
    for (const metric of labels) {
      const key = metric.label.trim().toLowerCase();
      if (definitionKeys.has(key)) {
        continue;
      }

      const units = Array.from(
        new Set(
          template.techniqueMetrics
            .filter((entry) => entry.label.trim().toLowerCase() === key && entry.unit)
            .map((entry) => entry.unit?.trim())
            .filter((entry): entry is string => Boolean(entry)),
        ),
      );

      const definition = await db.programTemplateTechniqueMeasurementDefinition.create({
        data: {
          techniqueId: primaryTechnique.id,
          label: metric.label,
          instructions: null,
          allowedUnits: units.length ? units : Prisma.JsonNull,
          orderIndex: nextOrderIndex,
        },
      });

      definitionKeys.set(key, definition.id);
      nextOrderIndex += 1;
    }

    for (const metric of template.techniqueMetrics) {
      if (metric.measurementDefinitionId) {
        continue;
      }

      const definitionId = definitionKeys.get(metric.label.trim().toLowerCase());
      if (!definitionId) {
        continue;
      }

      await db.athleteTechniqueMetric.update({
        where: { id: metric.id },
        data: { measurementDefinitionId: definitionId },
      });
    }
  }

  return db.programTemplate.findUnique({
    where: { id: programTemplateId },
    include: {
      techniques: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        include: {
          mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
          measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
        },
      },
    },
  });
}