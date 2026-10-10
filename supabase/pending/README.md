# Migraciones pendientes

Los SQL que permanezcan en este directorio están fuera de `supabase/migrations/`
para que `supabase db push` no los incluya. No representan una aplicación.

Las migraciones 009–020 se trasladaron a `supabase/migrations/` y se aplicaron
solo a DEV tras autorización, preflight de destino e historial y dry-run individual.
Este directorio no contiene SQL pendiente al cierre de esa secuencia. Verifica
siempre historial y destino antes de crear o aplicar migraciones futuras.
