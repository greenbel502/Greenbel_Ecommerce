# Excepción aprobada y ejecutada: historial ficticio protegido en DEV

## Estado inicial comprobado (antes de la excepción)

La limpieza ordinaria ya eliminó 12 productos, 60 cuentas ficticias, 6 capacitaciones, 3 mensajes y sus archivos asociados elegibles. Se conservaron las 3 cuentas sin marca de prueba y el administrador operativo. Los 24 productos ficticios restantes están archivados: ninguno aparece en el catálogo público.

Quedan 35 pedidos identificados por cliente de fixture, producto de fixture o referencia explícita; 67 operaciones y 37 movimientos de inventario; 3 cotizaciones; 1 borrador de financiamiento; sus pagos/envíos/postventa y 45 cuentas de fixture referenciadas. Hay 64 eventos de auditoría vinculados a fixtures y 2 eventos legítimos de habilitación de administradores que se conservan.

## Procedimiento revisado y aprobado el 22/10/2026

Las reglas aprobadas impiden borrar historial de inventario, cotizaciones y auditoría. La solicitud de limpieza no se interpreta como autorización para desactivar estas protecciones. Para borrar realmente el resto hace falta aprobar esta excepción de mantenimiento DEV:

1. Procedimiento manual exclusivo de herramientas DEV, sin ruta HTTP ni botón público. Comprobar APP_ENV, URL, referencia enlazada y proyecto remoto; abortar ante discrepancia. Nunca promover este procedimiento de datos a PROD ni incluirlo como migración de despliegue.
2. Manifestar IDs exactos de los fixtures y cerrar sus dependencias; preservar las tres cuentas no identificadas como fixtures, los 116 códigos del archivo de empresa, sus imágenes y ambos eventos reales de administradores. Abortará si un ID ya no corresponde a un fixture o existen referencias de registros no aprobados.
3. Copia privada antes del borrado de registros y archivos afectados, sin credenciales en Git. La copia de perfiles/metadatos no se presenta como respaldo restaurable de contraseñas Auth.
4. Una transacción con bloqueos que impidan escrituras concurrentes en las tablas afectadas. Mantener claves foráneas y RLS. No usar `session_replication_role`, TRUNCATE, reset ni borrados de tablas completas.
5. Suspender únicamente, durante esa transacción, los triggers que prohíben el DELETE de los IDs aprobados. No alterar sus funciones ni introducir excepciones permanentes. Borrar hijos antes de padres por IDs explícitos y reactivar todos esos triggers antes de COMMIT. Ante cualquier fallo: ROLLBACK completo. Esta suspensión temporal es la excepción a la regla inmutable que requiere aprobación específica.
6. Eliminar objetos de Storage mediante su API solo después del éxito de la transacción y comprobar que sus metadatos asociados fueron eliminados. Si falla Storage, conservar copia y registrar la operación exacta pendiente.
7. Verificar ausencia de los IDs ficticios aprobados, conservación íntegra de las cuentas/catálogo reales, triggers habilitados, RLS sin cambios y recorrido de administrador.

## Ejecución y resultado · 22/10/2026

Autorización expresa recibida: «Sí, autorizo esa excepción solo en DEV». La aprobación de 023 fue independiente de esta autorización.

**PASS DEV:** transacción confirmada, 35 pedidos ficticios y sus dependencias eliminados; 24 productos y 45 cuentas ficticias restantes eliminados. Se preservaron las 3 cuentas no identificadas como fixtures, el catálogo de empresa y sus imágenes. Nueve guards de DELETE se suspendieron exclusivamente durante la transacción y se restauraron antes del COMMIT. Comparación de metadatos de esquema, triggers y RLS sin diferencias; fingerprint de todas las filas no objetivo idéntico. Storage: 9 archivos ficticios retirados tras respaldarlos, además de los 2 de la limpieza inicial.

**FAIL resuelto:** la primera transacción encontró una FK de `greenbel_private.staff_order_operations` y se revirtió íntegramente. Se verificó que conservaba 35 pedidos, 48 perfiles, 140 productos y cero triggers deshabilitados. Se inspeccionó y respaldó el diario privado de 37 operaciones, se incorporaron sus claves explícitas al procedimiento y se ejecutó de nuevo con éxito. Una validación previa también rechazó claves de texto tratadas como UUID; se corrigió antes de ejecutar SQL.

Copias privadas de filas, metadatos y binarios en `~/.codex/private/greenbel-dev-catalog-20261022/`, permisos 700/600. Los metadatos Auth no son un respaldo de contraseñas ni una garantía de restauración integral.

Evidencia sin datos personales: [verificación](history-purge-verification.json), [conteos finales](final-dev-counts.json), [informe](2026-10-22-result.md). El script `scripts/dev-purge-reviewed-history.mjs` conserva las condiciones iniciales y falla cerrado después de esta ejecución; no debe repetirse ni promoverse a PROD. No es una migración de despliegue.
