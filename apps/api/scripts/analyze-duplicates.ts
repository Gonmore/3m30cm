import pg from "pg";

const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://postgres:D3v3%2Fop3R@192.168.10.57:5432/3m30cm",
});

async function main() {
  await client.connect();
  await client.query('SET search_path TO "public"');

  // List all tables to see the actual table names
  const tableRes = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  console.log("Tables in public schema:");
  tableRes.rows.forEach((r) => console.log(`  ${r.tablename}`));

  // Find all foreign keys referencing Exercise table
  const exerciseRegclass = await client.query(`SELECT to_regclass('"Exercise") as cls`);
  console.log("\nExercise regclass:", exerciseRegclass.rows[0]);

  // Find all foreign keys referencing Exercise
  const fkRes = await client.query(`
    SELECT conname, conrelid::regclass AS table_name, a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attnum = ANY(con.conkey) AND a.attrelid = con.conrelid
    WHERE con.confrelid = to_regclass('"Exercise"')
    ORDER BY table_name
  `);
  console.log("\nForeign keys referencing Exercise:");
  if (fkRes.rows.length === 0) {
    console.log("  (none found)");
  }
  fkRes.rows.forEach((r) =>
    console.log(`  ${r.table_name}.${r.column_name} (via ${r.conname})`),
  );

  // Find duplicate exercises by videoUrl
  const dupRes = await client.query(`
    SELECT url, COUNT(DISTINCT e.id) as exercise_count,
           ARRAY_AGG(e.id ORDER BY e."createdAt") as exercise_ids,
           ARRAY_AGG(e.name ORDER BY e."createdAt") as exercise_names
    FROM "ExerciseMediaAsset" ema
    JOIN "Exercise" e ON e.id = ema."exerciseId"
    WHERE ema.kind = 'VIDEO' AND ema.url IS NOT NULL AND ema.url != ''
    GROUP BY url
    HAVING COUNT(DISTINCT e.id) > 1
    ORDER BY exercise_count DESC
  `);
  console.log("\nDuplicate exercises by videoUrl:");
  let totalDuplicates = 0;
  dupRes.rows.forEach((r) => {
    const url = r.url || '';
    console.log(`  URL: ${url.substring(0, 60)}... | exercises: ${r.exercise_count} | names: ${r.exercise_names.join(', ')}`);
    totalDuplicates += r.exercise_count - 1;
  });
  console.log(`\nTotal duplicate exercises to delete: ${totalDuplicates}`);

  // Count total exercises
  const totalRes = await client.query('SELECT COUNT(*) as total FROM "Exercise"');
  console.log("\nTotal exercises:", totalRes.rows[0].total);

  // Count ExerciseTaskTemplate referencing duplicates
  const ettRes = await client.query(`
    SELECT COUNT(*) as total
    FROM "ExerciseTaskTemplate" ett
    JOIN "Exercise" e ON e.id = ett."exerciseId"
    JOIN "ExerciseMediaAsset" ema ON ema."exerciseId" = e.id
    WHERE ema.kind = 'VIDEO' AND ema.url IS NOT NULL AND ema.url != ''
    AND ema.url IN (
      SELECT url FROM "ExerciseMediaAsset" ema2
      WHERE ema2.kind = 'VIDEO' AND ema2.url IS NOT NULL AND ema2.url != ''
      GROUP BY url HAVING COUNT(DISTINCT ema2."exerciseId") > 1
    )
  `);
  console.log("ExerciseTaskTemplate referencing duplicate exercises:", ettRes.rows[0].total);

  await client.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
