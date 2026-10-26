# Bell — implementación y entrega DEV

26/10/2026. Modelo y migración 033 aprobados explícitamente por el usuario y aplicados solo en DEV. Implementación sobre Greenbel_Ecommerce; no se creó otra aplicación. No se hizo commit, push ni despliegue; PROD no se modificó.

## Resultado

Bell consulta el catálogo existente, precios vigentes, ofertas, disponibilidad, categorías, marcas y hasta seis especificaciones de un producto identificado. Responde preguntas frecuentes con conocimiento revisado. Reconoce saludos, despedidas, compras, productos, precios, inventario, categorías, marcas, promociones, pagos, entregas, financiamiento, pedidos, contacto, políticas y capacitaciones. Conserva contexto limitado para «el más económico», «este producto» y «más opciones». Este último excluye hasta 30 productos ya mostrados. Una pregunta desconocida ofrece Contacto; las dosis, mezclas y tratamientos sin respaldo no se recomiendan.

**No usa un modelo generativo ni una API comercial de IA. La búsqueda semántica está preparada, pero no está activa.** La versión operativa usa SQL, FTS español, trigramas, normalización y reglas. No se añadieron dependencias de inferencia, servicios ni suscripciones.

## Auditoría y arquitectura

Se verificaron Next.js 15.5.27, React 19, TypeScript, Supabase JS/SSR, Zod, Sileo, Auth, perfiles activos, roles, panel y RLS existentes. PostgreSQL DEV 17.6 permite vector 0.8.2, pg_trgm 1.6 y unaccent 1.1; 033 instala estas extensiones. El chatbot previo era una guía de tres enlaces, sin mensajes ni recuperación. Se conservaron la mascota, la carga diferida y los accesos útiles.

Flujo: navegador → `/api/chat` Node → origen/tamaño/sesión/cuota → intención/contexto → catálogo público o conocimiento revisado → respuesta con fuentes → persistencia privada → interfaz. La ficha pública actual puede aportar el contexto de producto; no aporta precios ni permisos desde el navegador.

- Catálogo: vista `catalog_products`, disponibilidad `product_availability`, `product_specs` y rutas de imágenes existentes. SQL devuelve hasta tres opciones. Un código exacto excluye coincidencias aproximadas ajenas. Ofertas y precios se obtienen al consultar, sin guardarlos como verdad en el conocimiento.
- Pedidos: cliente Supabase de sesión, RLS y `.eq('customer_id', userId)`, incluso para personal administrativo en el chat público. Visitantes reciben el acceso a Ingresar. Las solicitudes WhatsApp no se presentan como pedidos web confirmados.
- Conocimiento: ocho respuestas iniciales basadas en los flujos aprobados actuales, con respaldo privado. No contienen precios, existencias, cobertura, tasas o plazos inventados. Nuevas respuestas requieren revisión y activación. Se admiten respuestas largas sin superar los límites de persistencia.
- Búsqueda: FTS español ponderado (pregunta A, palabras B, respuesta C), texto sin tildes, trigramas, nombres de marca/categoría, SKU y sinónimos agrícolas limitados. La expansión no transforma «abono orgánico» en otro producto sin esa cualidad.
- Ranking: listas FTS/trigramas y vectores opcionales se fusionan con RRF, `k=60`. Hasta 20 candidatos por lista y tres resultados. El modo «hybrid» solo aparece cuando contribuye un vector real. Sin coincidencia textual, una intención institucional inequívoca puede usar la respuesta revisada de su categoría y se marca como regla.
- Disponibilidad: ausencia de registro de inventario significa «Existencia por confirmar». Si hay inventario gestionado, solo se marca disponible cuando el saldo supera lo reservado. No se ofrece una cantidad inventada.

## Modelo 033 y seguridad

Tablas nuevas: `chatbot_knowledge`, `chatbot_embedding_jobs`, `chatbot_conversations`, `chatbot_messages`, `chatbot_rate_limits`. RLS en las cinco; índices FTS/trigramas/HNSW y de actividad/propietario. No se duplicó el catálogo ni se cambió su lógica, checkout, pagos o autenticación.

- Token de visitante aleatorio de 32 bytes, cookie HttpOnly, SameSite=Lax, Secure en producción; solo su SHA-256 se guarda en la conversación. Cookie limitada a `/api/chat`. La cuenta se obtiene con `auth.getUser()`, nunca desde el cuerpo. Se exige perfil activo para cuentas autenticadas.
- Cada lectura/escritura verifica hash de sesión, cuenta y vencimiento. Historial directo no accesible a anon/authenticated. La API administrativa verifica administrador activo; operadores no pueden leerlo. Notas de fuentes, actores y credenciales no se publican.
- Origen permitido, JSON estricto, máximo de cuerpo 8 KiB, mensaje de 1,000 caracteres y parámetros con Zod. SQL está definido y parametrizado; no se ejecutan instrucciones del usuario. React representa texto, sin HTML arbitrario.
- Cuotas atómicas en PostgreSQL: 20 mensajes/minuto por sesión/cuenta y 60 por origen confiable. En desarrollo se comparte el origen local. En un hosting de producción cuyo proxy no esté verificado se aplica una cuota compartida conservadora; no se confía en `X-Forwarded-For` enviado por el visitante. Para un límite individual por IP en otro hosting hay que verificar su proxy antes de adaptar ese origen.
- UUID de solicitud para idempotencia; primer UUID identifica la conversación. Una solicitud repetida devuelve la respuesta guardada. Turnos concurrentes se serializan; una operación interrumpida tiene espera de 30 segundos y hasta tres intentos. Máximo de 100 mensajes por conversación y 40 al recuperar el historial.
- Errores públicos genéricos, sin secretos; los fallos de recuperación se registran como `data_unavailable` para supervisión. No hay endpoint público para escribir conocimiento o ejecutar trabajos de embeddings.
- Caducidad de acceso al historial: 30 días desde su creación. La eliminación física es una acción administrativa acotada de hasta 1,000 conversaciones vencidas; **no se configuró un cron ni se promete eliminación física automática**. «Limpiar vencidas» exige modal. Con un hosting confirmado podrá programarse esa misma operación con autorización.

Las respuestas históricas conservan la información consultada al responder. Una pregunta nueva vuelve a consultar los precios y el inventario; un reintento idéntico conserva la respuesta original para evitar duplicados.

## Embeddings: preparado y pendiente

Se revisaron las fuentes primarias de [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) y su [conversión ONNX de Xenova](https://huggingface.co/Xenova/multilingual-e5-small). El contrato es 384 dimensiones, `query: ` / `passage: `, mean pooling, normalización L2 y truncamiento a 512 tokens. Los artefactos consultados pesan aproximadamente 470.6 MB (original) y 118.3 MB (ONNX cuantizado). Su tamaño no demuestra memoria, latencia o concurrencia viables en el hosting del proyecto.

No se confirmó infraestructura de producción ni se asumió Vercel. Por eso no se descargó ni se ejecutó el modelo en el runtime. No hay proveedor, motor, worker programado ni variable que active mágicamente la inferencia. DEV termina con ocho conocimientos pendientes y cero vectores listos.

El contenido nuevo o modificado invalida el vector por hash y encola automáticamente su versión, sin trabajo pesado en la transacción. Las fuentes/notas sin cambio de contenido no obligan a regenerar. `processEmbeddingJobs` procesa lotes acotados solo si recibe un motor real; sin él no reclama trabajos. Hay leases, protección frente a versiones obsoletas, cinco intentos y espera exponencial en la cola. Admin puede reencolar toda la base. El texto sigue consultable con vector pendiente o fallido.

Para activar semántica después: confirmar capacidad del servidor Node existente, implementar y comprobar un adaptador real con ese mismo modelo/procesamiento para consultas y documentos, conectar el adaptador a `chatbotData` y la cola a las RPC privadas de claim/finish, y ejecutar una evaluación en español. El umbral vectorial inicial de similitud 0.75 requiere calibración con ese motor. Los vectores numéricos de los tests son fixtures de contrato, **no evidencia de inferencia semántica**.

## Administración e interfaz

`/admin/chatbot`, disponible solo a administradores:

- Tabla de conocimiento con búsqueda, filtros, estado, edición y eliminación lógica confirmada. Editor derecho, revisión, fuente privada y guardar al final. Información inactiva o sin verificar no aparece a clientes.
- Tabla de conversaciones con filtro de consultas sin respuesta, historial privado en panel derecho y errores de consulta identificados. No se edita lo dicho por el cliente.
- Métricas reales del historial conservado: conversaciones, mensajes, respuestas, desconocidos, temas, productos mostrados y preguntas frecuentes. No son analítica de ventas ni una medida de popularidad comercial.
- Reindexación en cola y limpieza de conversaciones vencidas con confirmación; no se muestra una inferencia inexistente como completada.

El chat conserva la identidad GreenBel y su mascota, tarjetas con fotos y enlaces de ficha, sugerencias, estado de consulta, reintento seguro y nueva conversación. Usa los tokens corporativos #1E3A1F/#3A4813/#80BA01/#E7E7CF y las fuentes locales existentes. No vuelve a usar Mont DEMO. Sileo muestra feedback transitorio; las confirmaciones y validaciones persistentes siguen el patrón del proyecto. No se creó un carrito secundario: las tarjetas enlazan a la ficha oficial, donde se utiliza el carrito existente.

## Variables y ejecución

No hay variables nuevas ni claves de IA. Se reutiliza la configuración existente del entorno activo:

```env
APP_ENV=DEV
DEV_APP_URL=http://localhost:3000
DEV_SUPABASE_URL=
DEV_SUPABASE_PUBLISHABLE_KEY=
DEV_SUPABASE_SECRET_KEY=
```

La clave privada queda exclusivamente en servidor. Las credenciales de CLI/base de datos solo se necesitan para aplicar y verificar migraciones DEV, nunca en el navegador ni en el runtime de Bell. No modificar variables Gmail ni las opciones comerciales para activar el chat.

Local: `npm ci`, configuración existente, `npm run dev`. Compilar con `npm run build` y ejecutar con `npm start` para un servidor Next.js Node compatible. No necesita un proceso adicional persistente.

Producción: primero confirmar hosting/versión Node/límites y proxy, autorizar y aplicar la migración revisada en la base correspondiente, configurar las variables `PROD_*` existentes y el origen HTTPS exacto, construir/desplegar el proyecto y repetir pruebas de sesión/cuotas/RLS/catálogo. **Estos pasos no se ejecutaron ni se autorizaron en esta entrega**. No se incluyeron credenciales PROD ni se aplicó 033 allí.

## Verificación ejecutada

Evidencias en [docs/qa/2026-10-26-chatbot](../qa/2026-10-26-chatbot/).

| Comprobación | Resultado |
|---|---|
| Unitarias y regresión de reseñas | PASS: 48 tests, incluyendo intenciones, contexto, embeddings ausentes/fallidos, prefijos, validación, mensajes largos, marcas y más opciones |
| SQL en DEV, rollback | PASS: 40 comprobaciones de permisos, titularidad, idempotencia, cuotas, contenido/vector/cola, búsquedas, actualización de precio e inventario disponible/reservado |
| HTTP contra Next local y Supabase DEV | PASS: 40 comprobaciones + 6 adicionales; 15 preguntas requeridas, variantes, precio actual, typo, historia, simultaneidad, origen, datos falsificados, códigos, marcas y contexto de ficha |
| Administración real en navegador | PASS: crear/editar respuesta inactiva, cancelar/confirmar retirada, modal de cambios sin guardar, foco y detalle privado de conversación |
| Responsive Chrome | PASS: 390/820/1440 px; chat y editor contenidos en pantalla, guardar al pie, sin desbordamiento horizontal del documento |
| Teclado | PASS: Enter envía, Escape cierra y devuelve foco; modal de descarte y retorno al editor/acción |
| TypeScript, ESLint acotado, diff de archivos seguidos | PASS |
| Build Next aislado, sin reemplazar `.next` del servidor local | PASS |
| Integridad de aplicación 033 | PASS: 16 tablas comerciales sin cambios; texto de migración DEV coincide con archivo final |
| Embeddings reales / calidad semántica | NO EJECUTADO: no hay motor configurado |
| Hosting/PROD, carga sostenida masiva, dispositivo móvil físico, pedido real con entrega | NO EJECUTADO |

Una muestra HTTP local de seis consultas tomó 487–1049 ms por respuesta. No es un benchmark de producción ni una promesa de latencia. Se probaron viewports de navegador, no teléfonos físicos. Las correcciones visuales se verificaron tras recargar los estilos de desarrollo cuando HMR los perdió temporalmente.

Se retiraron con respaldo privado y simulación rollback los fixtures HTTP: 15 conversaciones, 154 mensajes, una respuesta temporal y tres cuentas. La conversación usada después manualmente se conservó. No se borraron reseñas, cuentas reales ni datos de catálogo/ventas. Las capturas muestran el estado de QA previo a esa limpieza; las métricas actuales no incluyen los fixtures retirados.

## Archivos

Creados:

- `src/lib/chatbot/{types,intents,engine,data,session,validation,embeddings,indexing,admin-types}.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/admin/chatbot/conversations/route.ts`
- `src/app/admin/chatbot/{page.tsx,actions.ts,chatbot-admin.tsx,chatbot.module.css}`
- `src/presentation/components/virtual-assistant.module.css`
- `supabase/migrations/20261026003300_chatbot.sql`
- `tests/chatbot.test.mjs`, `tests/chatbot.sql`
- `scripts/dev-chatbot-{qa,extra-qa,cleanup}.mjs`
- Plan, entrega y evidencias `docs/chatbot/` / `docs/qa/2026-10-26-chatbot/`.

Modificados: `virtual-assistant.tsx` (integración del motor), `admin-shell.tsx` (acceso Bell solo admin), `public-submission.ts` (origen de cuotas del chat sin asumir proveedor de hosting), `AGENTS.md`, `GREENBEL_AVANCE.md` y guía de entorno (continuidad). No se añadieron dependencias ni se alteró checkout en este trabajo.

## Continuidad y límites

La versión textual está operativa y verificada en DEV. Para ampliar respuestas debe incorporarse información comercial aprobada desde administración; el bot no completa políticas faltantes por su cuenta. Embeddings reales, automatización de retención y validación del hosting siguen pendientes de una infraestructura confirmada y pruebas propias. No hay cargos por tokens: continúan existiendo los costos normales de Next/Supabase, almacenamiento, transferencia y eventual cómputo si se activa inferencia propia.
