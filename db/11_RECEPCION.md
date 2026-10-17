# D-2.5 · Recepción HU-2.4 · DEMO FICTICIA

`fn_recibir(p_staff uuid, p_shipment uuid, p_items jsonb, p_notes text) → jsonb`.
Backend: POST `/shipments/{id}/receipt` (201); devuelve exactamente ShipmentResult,
con guide_code. No depende de fn_marcar_entregado: admite recepción directa desde
dispatched y desde delivered_unchecked. Conserva delivered_at: checked_at registra
el conteo. No modifica rutas, reservas ni las funciones anteriores.

## Validaciones y errores

- P0403: auxiliar activo y asignado al punto; el QR solo identifica el envío.
- P0404: envío inexistente. P0409: recepción previa, estados/fechas incompatibles,
  inventario o trazabilidad incompatibles. La repetición devuelve P0409, sin efectos.
- P0422: items no vacío, una línea por shipment_item, UUID válido y perteneciente
  al envío, sin duplicados/omisiones, cantidades JSON numéricas con hasta tres
  decimales: 0 ≤ accepted_qty ≤ counted_qty ≤ shipped_qty. Nunca convertir a float.
- Las líneas y movimientos de despacho deben corresponder en producto/lote;
  cada línea debe tener su propia entrada de despacho TRA, no tomar la de otro
  envío. Una recepción parcial previa sin receipts se rechaza, no se repara.

## Transacción e inventario

Todo ocurre en la transacción del llamador: receipts + receipt_items + traslados
+ incidencia + estados + audit_events (`shipment_receipt`). Fechas nuevas:
reference_at. Error → rollback total. No hay COMMIT interno ni llamadas externas.

Por línea se trasladan accepted_qty de TRA al punto y counted_qty − accepted_qty
de TRA a CUA. Cada pareja tiene reason=receipt, el mismo transfer_group y
shipment_item_id. No insertar movimientos de cantidad cero. La diferencia
shipped_qty − counted_qty permanece en TRA; una incidencia receipt_shortage por
recepción agrupa esas líneas, severity=high como INC-RECEPCION de la semilla,
estado open y código INC-NNN bajo el mismo bloqueo usado por reglas/bodega.
Solo dañadas, sin faltantes, no inventa una incidencia receipt_shortage.
Todas aceptadas = reconciled; cualquier diferencia = with_difference (envío/pedido).
El físico disponible en TRA debe respaldar todo lo enviado, no solo lo contado:
si no, los faltantes desaparecerían del ledger. Las reservas activas se respetan.
No existe una regla contractual de rechazar lotes vencidos al recibir: el auxiliar
cuenta y acepta o manda a cuarentena; SQL no repite FEFO ni altera sus cantidades.

Orden de bloqueos: pedido → envío → advisory inventario (17391011,5) → ítems de
pedido/envío por UUID → lotes FOR SHARE → advisory ubicación/lote por hash ordenado
→ códigos de incidencia (17391011,2), si hay faltante. Compatible con preparación y
despacho. Serializa recepciones e impide consumir inventario reservado.

### Empate del reloj fijo

El trigger original valida el historial por `(occurred_at,id)`. Una salida de TRA
con UUID aleatorio menor que la entrada de despacho en el mismo reference_at
produciría un negativo histórico artificial. Sin cambiar el trigger ni la fecha,
la función asigna a cada salida un UUID posterior al último de TRA/lote en ese
instante, avanzándolo solo si hace falta y comprobando unicidad bajo los bloqueos.
No cambia UUID de envíos, líneas ni QR. Si no existe UUID posterior representable,
P0409 y rollback. Las entradas positivas no requieren ese desempate.

## Pruebas e integración

PGlite usa únicamente Auth y datos ficticios locales. Cubre permisos efectivos,
contrato JSON, estados, pitch INS-002 10/8/8, dañadas/faltantes/cero, dos lotes,
precisión decimal, trazabilidad corrupta, reservas en TRA, UUID extremos,
repetición, propio/courier y fallos de movimiento/incidencia/auditoría con rollback.
PED-DEMO-005 ya tiene recepción en la semilla: su repetición se rechaza y el caso
del pitch se reproduce con un envío nuevo, sin editar 03.

Concurrencia con dos conexiones PostgreSQL (preparar/despachar/recibir y dos
recepciones simultáneas) sigue pendiente de Fase 0. Las llamadas encoladas en
PGlite comprueban repetición, no demuestran carreras reales. Sin ejecución remota,
sin cambios de Auth, Data API, OpenAPI ni db/01…10. Requiere revisión de Jorge/Omar.

El despliegue futuro debe revisar únicamente el bloque nuevo de fn_recibir y sus
GRANT/REVOKE: 11 ya contiene funciones aplicadas y fn_confirmar_ruta aún usa CREATE
FUNCTION. No volver a aplicar todo el archivo sobre el proyecto existente sin
preparar antes el procedimiento incremental y obtener autorización.
