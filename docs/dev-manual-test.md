# Probar GreenBel en DEV

Esta guía usa únicamente el proyecto Supabase **DEV**. Los artículos, zonas, tarifas, pedidos y pagos de prueba deben identificarse como **PRUEBA DEV**. No uses datos de clientes ni ejecutes entregas o cobros físicos con estos registros.

## Arrancar

1. En la raíz del proyecto, prepara un `.env` local ignorado por Git con los nombres descritos en [la guía de entorno](../GREENBEL_VARIABLES_DE_ENTORNO.md). Para la tienda conectada se necesitan `APP_ENV=DEV`, `DEV_APP_URL`, `DEV_SUPABASE_URL` y `DEV_SUPABASE_PUBLISHABLE_KEY`. Las operaciones privadas del servidor y el panel requieren `DEV_SUPABASE_SECRET_KEY`. Las credenciales de CLI solo son necesarias para scripts administrativos, no para `npm run dev`. Deja deshabilitado el modo de los tres correos de negocio; Resend y las variables PROD pueden estar vacíos.
2. Comprueba el destino local sin imprimir valores: `node --env-file=.env scripts/dev-target-preflight.mjs`. Si usarás herramientas administrativas, confirma también el historial remoto con `node --env-file=.env scripts/dev-supabase-cli.mjs list` y que el enlace y la URL pertenecen a DEV.
3. Ejecuta `npm ci` y `npm run dev`. Abre `http://localhost:3000`. La fuente Supabase se selecciona por defecto al tener URL y clave pública DEV; `GREENBEL_CATALOG_SOURCE=mock` es solo una vista aislada con datos ficticios y no sirve para comprobar persistencia.

## Acceso de administración

Sigue [Acceso administrativo en Supabase DEV](dev-admin-access.md) para crear el **primer** administrador sin publicar su contraseña. Entra por `/cuenta/ingresar` y abre `/admin/catalogo`. Las demás rutas de trabajo son `/admin/inventario`, `/admin/capacitaciones`, `/admin/consultas`, `/admin/cotizaciones`, `/admin/financiamiento`, `/admin/ventas`, `/admin/entregas`, `/admin/resenas` y `/admin/usuarios`. No hay una página `/admin` genérica.

También puedes crear tu cuenta mediante **Continuar con Google** en ingreso o registro. El alta recibe `customer`; Google no concede administrador. [Guía de Google DEV, pruebas y marca pendiente](dev-google-auth.md). El flujo permite `localhost:3000` y `localhost:3001`; sigue el puerto mostrado al iniciar Next.

En `/cuenta` puedes editar nombre/teléfono/dirección y cargar una foto privada. [Prueba del perfil y reutilización en compras](dev-customer-profile.md). La migración 021 y su [registro de futura promoción](migrations/021-customer-profile.md) están conservados en el proyecto; solo se aplicó a DEV.

Para probar como comprador mientras Auth no tiene SMTP propio, crea manualmente otra cuenta de prueba en **Authentication → Users** del mismo proyecto DEV y confírmala administrativamente solo para esta prueba. Guarda la contraseña en tu gestor. Este mecanismo no valida el registro público, la confirmación enviada por correo ni la recuperación: esos recorridos siguen **NO EJECUTADOS** hasta configurar SMTP de Auth con dominio/Resend. Conserva habilitada la confirmación de correo.

## Recorrido recomendado

1. En `/admin/catalogo`, crea o usa una categoría, marca y producto con etiqueta explícita **PRUEBA DEV**. Al cierre de la QA había 11 productos ficticios publicados, 6 categorías y 1 marca de prueba activas; comprueba su estado actual antes de usarlos. Prueba un producto con precio GTQ y otro sin precio: el segundo debe indicar «Precio próximamente». Añade especificaciones, incluidos e imagen; publica solo el artículo ficticio que quieras mostrar. En `/admin/inventario`, registra una entrada de prueba para el producto con precio.
2. En una ventana privada **sin sesión**, abre `/productos`, la ficha y `/carrito`. Comprueba que una cotización PDF de invitado se descarga con su enlace privado y que no crea una reserva. Ese enlace contiene un token de acceso: no lo compartas. Sin token válido no debe poder descargarse un PDF ajeno.
3. Para comprar, inicia sesión, añade el artículo con stock y abre `/checkout`. Usa CF con nombre, apellido y teléfono ficticios o NIT con datos **ficticios**; no uses un NIT real. Revisa el total GTQ desde el servidor y confirma únicamente cuando coincida con lo mostrado. En `/cuenta/pedidos` comprueba el pedido y el estado de reserva, entrega y pago por separado.
4. En `/admin/ventas` o `/admin/entregas`, una compra online aún sin pago confirmado debe mostrar el aviso de espera y **no ofrecer Preparar**, aunque la reserva siga vigente; la RPC también lo rechaza. Para simular el éxito únicamente en DEV, toma el UUID de la URL `/cuenta/pedidos/UUID`, inicia un intento y usa el `paymentId` devuelto para registrar el evento desde tu terminal local:

   ```bash
   node --env-file=.env scripts/dev-simulated-payment.mjs start UUID_DEL_PEDIDO
   node --env-file=.env scripts/dev-simulated-payment.mjs event UUID_DEL_PAGO success
   ```

   Este script exige enlace y clave administrativa de DEV, y muestra claves de reintento no secretas. Úsalo solo con un pedido ficticio propio; no invoca una pasarela ni cobra. Tras el éxito simulado y consumo de stock, la preparación debe ser posible. Una compra contra entrega puede prepararse con reserva vigente; el despacho consolida inventario y el cobro se registra aparte.
5. En `/contacto`, confirma que la página diga **registrada**, nunca «correo enviado». En `/financiamiento`, comprueba que la solicitud permanezca en borrador pendiente de verificación y envío. Los tres correos de negocio no se envían.
6. Repite el acceso en otra cuenta compradora y sin sesión: no deben verse pedidos, listas de documentos, consultas ni paneles ajenos. Para una comprobación visual móvil, usa un viewport de **390 CSS px** y recorre carrito → checkout → revisión → confirmación; comprueba campos, botones y que no haya desbordamiento horizontal.

No existe una pasarela real ni datos finales de retiro, cobertura, tarifas o políticas de reembolso/garantía. Los resultados técnicos y las verificaciones que realmente se ejecutaron constan en [el avance](../GREENBEL_AVANCE.md).
