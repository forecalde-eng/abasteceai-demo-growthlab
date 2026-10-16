import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PlaneIcon, QrCodeIcon, RefreshCwIcon } from 'lucide-react'
import {
  Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent,
  CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, Input,
  Label, LoadingState, PageHeader, Select, StatusBadge, Table, TableBody,
  TableCaption, TableCell, TableHead, TableHeader, TableRow, TONO,
} from '@/ui'
// temporal: reemplazar por @/data
import { useShipments } from './useCourierShipments'

const dateTime = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'America/Guayaquil',
})

export function Courier() {
  const query = useShipments()
  const [search, setSearch] = useState('')
  const [followUp, setFollowUp] = useState('all')
  const term = search.trim().toLocaleLowerCase('es-EC')
  const rows = (query.data ?? []).filter((row) => followUp !== 'delayed' || row.isDelayed)
    .filter((row) => !term || `${row.code} ${row.guide_code} ${row.order.code} ${row.location.code} ${row.location.name} ${row.location.city} ${row.carrier_name ?? ''}`.toLocaleLowerCase('es-EC').includes(term))

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader icon={<PlaneIcon />} title="Courier" description="Envíos interprovinciales, fecha prometida y seguimiento al reloj de demo." actions={
        <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch() }}><RefreshCwIcon data-icon="inline-start" />{query.isFetching ? 'Actualizando…' : 'Actualizar'}</Button>
      } />

      {query.isLoading ? <LoadingState label="Cargando envíos courier…" /> : query.isError ? (
        <ErrorState title="No se pudieron cargar los envíos courier" description={query.error?.message} onRetry={() => { void query.refetch() }} />
      ) : (
        <>
          <Alert>
            <AlertTitle>Seguimiento con fecha de referencia fija</AlertTitle>
            <AlertDescription>
              <p>Reloj de demo: {query.referenceAt ? <time dateTime={query.referenceAt}>{dateTime.format(new Date(query.referenceAt))}</time> : 'Sin referencia'} · Ecuador.</p>
              <p>«Retrasado» viene de la consulta SQL oficial: fecha prometida anterior a esa referencia y sin entrega confirmada. No es un estado nuevo del envío.</p>
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:max-w-sm"><Label htmlFor="courier-search">Buscar envío, guía o destino</Label><Input id="courier-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ENV-DEMO-008 o G-001" /></div>
            <div className="flex w-full flex-col gap-2 sm:max-w-xs"><Label htmlFor="courier-filter">Seguimiento</Label><Select id="courier-filter" value={followUp} onChange={(event) => setFollowUp(event.target.value)}><option value="all">Todos los courier</option><option value="delayed">Solo retrasados</option></Select></div>
          </div>

          <Card className="min-w-0">
            <CardHeader><CardTitle>Envíos por courier</CardTitle><CardDescription>Solo datos registrados: guía, operador y promesa de entrega. Esta pantalla no registra entregas ni mueve stock.</CardDescription></CardHeader>
            <CardContent className="min-w-0">
              {rows.length === 0 ? (
                <EmptyState icon={<PlaneIcon />} title="Sin envíos courier para mostrar" description={term || followUp !== 'all' ? 'No hay envíos que coincidan con estos filtros.' : 'No hay envíos courier registrados en los datos actuales.'} />
              ) : (
                <Table aria-label="Envíos courier"><TableCaption>Fechas en hora de Ecuador continental. El estado y la alerta de retraso se muestran por separado.</TableCaption>
                  <TableHeader><TableRow><TableHead>Envío / pedido</TableHead><TableHead>Destino</TableHead><TableHead>Operador / guía</TableHead><TableHead>Fecha prometida</TableHead><TableHead>Seguimiento</TableHead><TableHead>Etiqueta</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                  <TableBody>{rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell><span className="block font-mono text-sm">{row.code}</span><span className="block font-mono text-sm text-muted-foreground">{row.order.code}</span></TableCell>
                      <TableCell><span className="block font-mono text-sm">{row.location.code}</span><span className="text-sm text-muted-foreground">{row.location.city}</span></TableCell>
                      <TableCell><span className="block text-sm">{row.carrier_name ?? 'Sin operador registrado'}</span><span className="font-mono text-sm text-muted-foreground">{row.guide_code}</span></TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{row.promised_delivery_at ? <time dateTime={row.promised_delivery_at}>{dateTime.format(new Date(row.promised_delivery_at))}</time> : 'Sin fecha prometida'}</TableCell>
                      <TableCell><Badge variant="outline" className={row.isDelayed ? TONO.problema : TONO.neutro}>{row.isDelayed ? 'Retrasado' : 'Sin alerta de retraso'}</Badge></TableCell>
                      <TableCell><Button asChild variant="outline" size="sm"><Link to={`/despacho?envio=${encodeURIComponent(row.code)}`}><QrCodeIcon data-icon="inline-start" />Ver etiqueta</Link></Button></TableCell>
                      <TableCell><StatusBadge kind="envio" value={row.status} /></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
