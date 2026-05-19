import * as fs from 'fs';
import csvParser from 'csv-parser';
import stringSimilarity from 'string-similarity'; // Asegúrate de instalarlo o pídele a Copilot que use una lógica nativa

interface CsvRow {
  id: string;
  name: string;
  target: string;
  bodyPart: string;
  [key: string]: string; // Para capturar las columnas instructions/0, etc.
}

// 1. Cargar el CSV completo en memoria para buscar eficientemente
const csvRows: CsvRow[] = [];
fs.createReadStream('exercises.csv')
  .pipe(csvParser())
  .on('data', (data) => csvRows.push(data))
  .on('end', async () => {
    
    // 2. Iterar sobre tus ejercicios en español
    for (const [nombreEs, keywordEn] of Object.entries(EXERCISE_MAP)) {
      console.log(`🔍 Procesando: ${nombreEs} -> Buscando: "${keywordEn}"...`);
      
      // Intentar coincidencia exacta
      let match = csvRows.find(row => row.name.toLowerCase() === keywordEn.toLowerCase());
      
      // Lógica de búsqueda por similitud (Fallback si no hay coincidencia exacta)
      if (!match) {
        console.log(`⚠️ No se encontró coincidencia exacta para "${keywordEn}". Buscando similares...`);
        
        // Compara el nombre esperado con todos los nombres del CSV y saca el que más se parezca
        const nombresCsv = csvRows.map(row => row.name);
        const matches = stringSimilarity.findBestMatch(keywordEn, nombresCsv);
        
        if (matches.bestMatch.rating > 0.4) { // Un 40% de similitud es un buen margen para nombres de fitness
          match = csvRows.find(row => row.name === matches.bestMatch.target);
          console.log(`🎯 Alternativa encontrada por similitud: "${match?.name}" (Score: ${matches.bestMatch.rating})`);
        }
      }

      if (match) {
        // === AQUÍ SE ENCONTRÓ EL EJERCICIO ===
        // 1. Tomas match.id (ej: "0024") para armar la URL de descarga de GitHub
        // 2. Concatenas las columnas row["instructions/0"], row["instructions/1"] para 'exerciseDBdescription_english'
        // 3. Traduces o procesas para 'exerciseDBdescription_spanish'
        // 4. Subes el archivo al contenedor Docker (bucket: jump-assets, ruta: /exercises)
        // 5. Guardas la URL final de supernovatel.com en tu Base de Datos
        
        const idGf = match.id;
        const urlGitHub = `https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets/${idGf}.gif`;
        
        console.log(`✅ Listo para descargar de: ${urlGitHub}`);
        // Aquí llamas a tu función de axios y subida a MinIO...
      } else {
        console.log(`❌ Imposible encontrar un ejercicio similar para: ${nombreEs}`);
      }
    }
  });