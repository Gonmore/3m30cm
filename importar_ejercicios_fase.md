# Guía: Importar ejercicios de una fase (CSV)

## Formato del CSV

El importador acepta texto separado por coma (`,`), punto y coma (`;`), tabulación o pipe (`|`).  
El **orden de las columnas no importa** siempre que el encabezado esté presente.

### Columnas requeridas

| Columna | Nombres aceptados | Descripción |
|---------|-------------------|-------------|
| `Día` | `Day`, `Dia`, `Día` | Número de día dentro del ciclo (1–N). |
| `Ejercicio` | `Name`, `Nombre`, `Ejercicio` | Nombre exacto del ejercicio en el catálogo. |

### Columnas opcionales

| Columna | Nombres aceptados | Valores válidos | Default |
|---------|-------------------|-----------------|---------|
| `Series` | `Sets`, `Series` | Entero positivo | vacío |
| `Reps/Tiempo` | `Reps`, `Tiempo`, `Reps/Tiempo`, `Reps-Tiempo`, `Reps_Tiempo` | Texto libre (`8`, `45 seg`, `10 min`) | vacío |
| `Descripción` | `Description`, `Descripcion`, `Descripción` | Texto libre | vacío |
| `Peso` | `Peso`, `Weight`, `Peso(Y/N)` | `Y` / `N` | `N` |
| `Unilateral` | `Unilateral`, `Unilateral(Y/N)` | `Y` / `N` | `N` |
| `Evolución` | `Evolucion`, `Evolución`, `Evolution` | `Weight`, `Time`, `Velocity`, `Hybrid` | requerido |
| `Zona` | `Zona`, `Zone` | `Lower`, `Upper`, `Core`, `Full` | requerido |
| `Título` | `Titulo`, `Título`, `Title` | Nombre de la sesión (aparece en el app como "Fase N/Día M: Título") | vacío |
| `VideoURL` | `VideoUrl`, `Video`, `UrlVideo` | URL completa | vacío |

> Columnas extra (p. ej. `Parte`) se ignoran silenciosamente.

---

## Ejemplo completo — Fase 1 (7 días)

```csv
Día,Título,Ejercicio,Series,Reps_Tiempo,Descripción,Peso,Unilateral,Evolución,Zona
1,Fuerza Reactiva,Movilidad Dinámica,3,10 min,Rotaciones de cadera y tobillo,N,N,Time,Full
1,Fuerza Reactiva,Depth Drops,4,6,Cajón 40cm. Caer y absorber en silencio.,N,N,Velocity,Lower
1,Fuerza Reactiva,Bulgarian Split Squat,4,8,Bajar en 4 seg. Subir explosivo.,Y,Y,Hybrid,Lower
1,Fuerza Reactiva,Push Ups Explosivas,3,12,Pecho al suelo y empuje máximo.,N,N,Velocity,Upper
1,Fuerza Reactiva,Nordic Curl Asistido,3,6,Controlar la caída lo más posible.,N,N,Time,Lower
1,Fuerza Reactiva,Plank con Toque de Hombros,3,45 seg,Mantener cadera inmóvil.,N,N,Time,Core
1,Fuerza Reactiva,Tibialis Raise,3,20,Espalda a la pared. Subir puntas.,N,N,Weight,Lower
1,Fuerza Reactiva,Estiramiento Estático,1,10 min,Foco en Psoas y Glúteo.,N,N,Time,Full
2,Descanso Activo,Descanso Activo,1,0,Día dedicado a recuperación.,N,N,Time,Full
3,Volumen Básico,Pogo Jumps Nivel 1,4,30 seg,Saltos cortos solo con tobillo.,N,N,Velocity,Lower
3,Volumen Básico,Goblet Squat,4,12,Mancuerna al pecho. Espalda recta.,Y,N,Weight,Lower
3,Volumen Básico,Pull Ups,3,8,Foco en retracción escapular.,Y,N,Weight,Upper
3,Volumen Básico,Deadlift Rumano,3,10,Estiramiento de isquios con carga.,Y,N,Hybrid,Lower
3,Volumen Básico,Copenhague Plank,3,30 seg,Fortalecimiento de aductores.,N,Y,Time,Core
3,Volumen Básico,Calf Raises,4,15,Rango completo de movimiento.,Y,Y,Weight,Lower
3,Volumen Básico,Face Pulls,3,20,Salud de hombro con banda.,N,N,Weight,Upper
3,Volumen Básico,Estiramiento Tren Inferior,1,15 min,Foco en Isquios y Cuádriceps.,N,N,Time,Lower
4,Movilidad,Estiramiento y Movilidad,1,40 min,Sesión completa de Yoga o movilidad fluida.,N,N,Time,Full
5,Potencia y Técnica,Saltos de Aproximación,6,3,2 pies. Foco en penúltimo paso.,N,N,Velocity,Lower
5,Potencia y Técnica,Step Ups Explosivos,4,6,Empuje potente desde el cajón.,Y,Y,Hybrid,Lower
5,Potencia y Técnica,Dips,3,10,Control de bajada y subida rápida.,Y,N,Weight,Upper
5,Potencia y Técnica,Glute Bridge Una Pierna,3,12,Extensión completa de cadera.,N,Y,Weight,Lower
5,Potencia y Técnica,Dead Bug,3,15,Coordinación core y respiración.,N,N,Time,Core
5,Potencia y Técnica,Aterrizaje Monopodal,4,5,Saltar y caer sobre una pierna.,N,Y,Velocity,Lower
5,Potencia y Técnica,Zancadas Laterales,3,10,Movimiento en plano frontal.,Y,Y,Weight,Lower
5,Potencia y Técnica,Estiramiento Tren Superior,1,10 min,Pectoral y Dorsal.,N,N,Time,Upper
6,Entrenamiento Equipo,Entrenamiento de Equipo,1,0,Día de carga técnica/táctica.,N,N,Time,Full
7,Descanso Total,Descanso Total,1,0,Recuperación completa del SNC.,N,N,Time,Full
```

---

## Valores válidos de Evolución y Zona

### Evolución (cómo progresa el ejercicio semana a semana)

| Valor en CSV | Significado |
|---|---|
| `Weight` / `Peso` | Progresión por carga (+2.5% o +2 kg) |
| `Time` / `Tiempo` | Progresión por tiempo (excéntricos, +5 s) |
| `Velocity` / `Velocidad` | Máxima intención de velocidad, sin cambio de carga |
| `Hybrid` / `Hibrido` | Combina carga + tiempo excéntrico |

### Zona (para el cálculo de Potencia en Path to the Dunk)

| Valor en CSV | Zona anatómica |
|---|---|
| `Lower` / `Inferior` | Tren inferior (cuádriceps, glúteo, isquios, pantorrilla) |
| `Upper` / `Superior` | Tren superior (pecho, espalda, hombro, tríceps) |
| `Core` / `Tronco` | Core y estabilizadores |
| `Full` / `Completo` | Cuerpo completo / movilidad |

---

## Errores comunes y cómo resolverlos

### "Fila X, columna 'evolution' → Evolution must be Weight, Time, Velocity, or Hybrid"

El valor de Evolución no es reconocido. Usa exactamente: `Weight`, `Time`, `Velocity` o `Hybrid` (o sus equivalentes en español).

### "Fila X, columna 'zone' → Zone must be Lower, Upper, Core, or Full"

El valor de Zona no es reconocido. Usa exactamente: `Lower`, `Upper`, `Core` o `Full` (o sus equivalentes en español).

### "Fila X, columna 'requiresWeight' → Weight must be Y/N"

La columna Peso solo acepta `Y`, `N`, `Yes`, `No`, `1`, `0`, `Si`, `S`.

---

## Opciones del importador

| Opción | Descripción |
|---|---|
| **Modo estricto** | Ya no bloquea el import. El importador **crea automáticamente** cualquier ejercicio que no exista en el catálogo usando los datos del CSV (nombre, zona, evolución, peso, unilateral, descripción). Al terminar, el mensaje de éxito lista los ejercicios recién creados. |
| **Reemplazar contenido existente** (activo por defecto) | Borra los días/tareas actuales de la fase antes de importar. Desactívalo para añadir sin borrar. |
