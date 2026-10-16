import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ mocks: false, getSession: vi.fn() }))
vi.mock('@/data', () => ({
  get useMocks() { return auth.mocks },
  getSupabaseClient: () => ({ auth: { getSession: auth.getSession } }),
}))
import { planRoutes } from './planRoutes'
import { fixtureProposal, fixtureRequest } from './routing-test-fixture'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); auth.mocks = false; auth.getSession.mockReset() })
function setup() {
  vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:8000/')
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'token-ficticio-de-prueba' } }, error: null })
}

describe('planRoutes: contrato C1', () => {
  it('POST /routes/plan con JWT y solo dispatch_date/order_ids', async () => {
    setup()
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixtureProposal())))
    vi.stubGlobal('fetch', fetch)
    await planRoutes({ ...fixtureRequest, role: 'logistica', vehicle_id: 'no-viaja' } as typeof fixtureRequest)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:8000/routes/plan')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer token-ficticio-de-prueba')
    expect(JSON.parse(options.body)).toEqual(fixtureRequest)
  })
  it('en mocks no fabrica una propuesta ni métricas', async () => {
    auth.mocks = true
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(planRoutes(fixtureRequest)).rejects.toThrow('No se han calculado km ni minutos')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sin sesión no consulta el planificador', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(planRoutes(fixtureRequest)).rejects.toThrow('Inicia sesión')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sin URL configurada no envía la solicitud', async () => {
    setup(); vi.stubEnv('VITE_BACKEND_URL', '')
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(planRoutes(fixtureRequest)).rejects.toThrow('Falta configurar')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('preserva el error del servicio y no reintenta automáticamente', async () => {
    setup()
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'VALIDATION', message: 'No hay pedidos listos para esa fecha.' } }), { status: 422 }))
    vi.stubGlobal('fetch', fetch)
    await expect(planRoutes(fixtureRequest)).rejects.toThrow('No hay pedidos listos para esa fecha.')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('un error de red no confirma ni devuelve una ruta de ejemplo', async () => {
    setup()
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch)
    await expect(planRoutes(fixtureRequest)).rejects.toThrow('No se ha confirmado ninguna ruta')
    expect(fetch).toHaveBeenCalledOnce()
  })
})
