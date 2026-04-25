# APK Releases

Guia operativa para generar el APK Android de `apps/mobile2` con una version especifica sin tocar el flujo de deploy web/api.

## Version actual

- `mobile2` queda en `version = 1.1.4`
- `android.versionCode = 114`

## Regla de versionado

Usa este criterio antes de generar cada APK:

- `expo.version`: version visible para el usuario en formato `MAJOR.MINOR.PATCH`
- `android.versionCode`: entero creciente requerido por Android

Convencion recomendada para este proyecto:

- `1.1.0` -> `110`
- `1.1.1` -> `111`
- `1.1.3` -> `113`
- `1.1.4` -> `114`
- `1.2.0` -> `120`
- `2.0.0` -> `200`

Si alguna vez necesitas mas de 9 parches o minors de dos digitos, mantén la regla principal: `versionCode` siempre debe subir respecto del APK anterior publicado.

## Archivos a actualizar

Antes del build, cambia ambos archivos:

1. `apps/mobile2/app.json`
2. `apps/mobile2/package.json`

En `apps/mobile2/app.json`:

```json
{
  "expo": {
    "version": "1.1.4",
    "android": {
      "versionCode": 114
    }
  }
}
```

En `apps/mobile2/package.json`:

```json
{
  "version": "1.1.4"
}
```

Regla práctica para la siguiente version:

- si la siguiente APK es `1.1.5`, usa `android.versionCode = 115`
- si la siguiente APK es `1.2.0`, usa `android.versionCode = 120`
- si la siguiente APK es `2.0.0`, usa `android.versionCode = 200`

## Build local del APK

Desde la raiz del repo:

```powershell
npm --prefix apps/mobile2 run build
echo y | npm --prefix apps/mobile2 run apk:prod
```

Ese flujo:

- valida TypeScript
- ejecuta `expo prebuild --platform android --clean`
- regenera la carpeta nativa Android
- compila `assembleRelease`
- vuelve a fijar un build Gradle estable en Windows limitando workers/paralelismo desde el helper

## Salida esperada

El APK queda en:

```text
apps/mobile2/android/app/build/outputs/apk/release/app-release.apk
```

## Procedimiento para futuras versiones

1. Define la nueva version visible, por ejemplo `1.2.0`.
2. Sube `android.versionCode` a un entero mayor, por ejemplo `120`.
3. Actualiza `apps/mobile2/app.json` y `apps/mobile2/package.json`.
4. Corre `npm --prefix apps/mobile2 run build`.
5. Corre `echo y | npm --prefix apps/mobile2 run apk:prod`.
6. Verifica la fecha del archivo generado en `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk`.

Checklist corto para la proxima version:

1. Elige `expo.version`.
2. Calcula `android.versionCode` manteniendo el entero en ascenso.
3. Cambia ambos archivos de version.
4. Ejecuta `npm --prefix apps/mobile2 run build`.
5. Ejecuta `echo y | npm --prefix apps/mobile2 run apk:prod`.
6. Confirma que existe `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk`.
7. Si cambiaste comportamiento de runtime de la app, instala esta APK nueva antes de probar; una APK vieja no toma cambios del bundle JS del repo.

## Notas operativas

- Este proceso no modifica `deploy.sh` ni el deploy Docker de `api`/`web`.
- `EXPO_PUBLIC_API_BASE_URL` para `apk:prod` ya apunta a `https://3m30cm.supernovatel.com`.
- La app movil no debe depender de links directos a MinIO si el bucket productivo es privado; la ruta correcta para media queda proxyada por la API bajo `/api/v1/assets/...` y por eso una APK nueva es necesaria cuando cambia esa logica cliente.
- Si Google login falla en un APK firmado, revisa el SHA-1 real del build release antes de tocar el codigo JS.