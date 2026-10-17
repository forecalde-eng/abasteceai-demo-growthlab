import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Mail,
  MessageCircle,
  PackageCheck,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  X,
} from "lucide-react";
import { steps, useAgentDemo } from "@/data/agente-compras/useAgentDemo";
import { money, quantity, requestText } from "@/data/agente-compras/model";
import { suppliers } from "@/data/agente-compras/fixtures";

const stepIcons = [ScanSearch, Users, Send, MessageCircle, FileCheck2, Mail];
const stepDescriptions = [
  "Consulta las señales de reposición",
  "Encuentra quién tiene los insumos",
  "Prepara correo y WhatsApp",
  "Recoge las cuatro proformas",
  "Revisa stock, plazo y precio",
  "Presenta el resumen a gerencia",
];
const activity = [
  "Necesidades leídas desde la vista de reposición. Las cantidades ya estaban calculadas en SQL.",
  "Cuatro proveedores de ejemplo encontrados en el directorio ficticio.",
  "Solicitudes simuladas: dos por correo y dos por WhatsApp. No se contactó a nadie.",
  "Cuatro respuestas ficticias recibidas, con precio, plazo y disponibilidad.",
  "Comparación calculada en código. Las ofertas sin stock o fuera de plazo no se recomiendan.",
  "Informe preparado para gerencia. No se ha realizado ninguna compra.",
];

function Tag({
  children,
  kind = "neutral",
}: {
  children: React.ReactNode;
  kind?: "neutral" | "teal" | "amber" | "violet" | "green" | "red";
}) {
  return <span className={`ag-tag ag-${kind}`}>{children}</span>;
}

export function AgentDemo() {
  const agent = useAgentDemo();
  const [messageTab, setMessageTab] = useState("andina");
  const [showReport, setShowReport] = useState(false);
  const selectedSupplier =
    suppliers.find((supplier) => supplier.id === messageTab) ?? suppliers[0];
  const selectedQuote = agent.quotes.find(
    (quote) => quote.supplier.id === selectedSupplier.id,
  );
  const best = agent.quotes.find((quote) => quote.eligible);
  const date = new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(new Date(agent.snapshot.referenceAt));
  const canShowResult = agent.ready && !agent.blocked;
  const reportDialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!showReport || !canShowResult) return;
    const opener = document.activeElement;
    reportDialog.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [showReport, canShowResult]);
  const download = () => {
    if (!agent.report) return;
    const url = URL.createObjectURL(
      new Blob([agent.report], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "AbasteceAI-recomendacion-DEMO.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="ag-demo">
      <div className="ag-demo-banner">
        DEMO FICTICIA <span>·</span> Proveedores, cotizaciones y comunicaciones
        simulados
      </div>
      <aside className="ag-sidebar">
        <a className="ag-logo" href="#inicio">
          <PackageCheck size={28} />
          <span>
            Abastece<span>AI</span>
          </span>
        </a>
        <div className="ag-nav-label">CENTRO DE OPERACIONES</div>
        <a className="ag-nav-item ag-nav-active" href="#inicio">
          <Bot size={19} /> Agente de compras <span className="ag-nav-dot" />
        </a>
        <a className="ag-nav-item" href="#necesidades">
          <ShoppingCart size={19} /> Necesidades detectadas
        </a>
        <a className="ag-nav-item" href="#proveedores">
          <Users size={19} /> Proveedores demo
        </a>
        <a className="ag-nav-item" href="#comparativo">
          <FileText size={19} /> Comparativo de ofertas
        </a>
        <div className="ag-sidebar-note">
          <ShieldCheck size={20} />
          <strong>Tú mantienes el control</strong>
          <p>
            El agente investiga y recomienda. Una persona revisa y aprueba la
            compra.
          </p>
        </div>
        <div className="ag-sidebar-bottom">
          <span className="ag-avatar">D</span>
          <div>
            <strong>Espacio de demostración</strong>
            <span>Abastecimiento inteligente</span>
          </div>
        </div>
      </aside>

      <div className="ag-workspace" id="inicio">
        <header className="ag-topbar">
          <div>
            Abastecimiento <ChevronRight size={14} />
            <strong>Agente de compras</strong>
          </div>
          <span>
            <span className="ag-status-dot" /> Entorno de demostración
          </span>
        </header>
        <main className="ag-main">
          <section className="ag-heading">
            <div>
              <div className="ag-eyebrow">
                <Sparkles size={14} /> DE LA ALERTA A LA RECOMENDACIÓN
              </div>
              <h1>
                Tu próxima compra,
                <br className="ag-mobile-break" /> un paso adelante.
              </h1>
              <p>
                El agente detecta lo que hace falta, consulta proveedores y te
                muestra la mejor opción.
              </p>
            </div>
            <Tag kind="neutral">
              <Bot size={14} /> Agente IA · SIMULADO
            </Tag>
          </section>

          <section
            className="ag-source-panel"
            aria-label="Fuente de inventario"
          >
            <div className="ag-source-description">
              <div className="ag-icon-box">
                <Database size={20} />
              </div>
              <div>
                <strong>
                  {agent.snapshot.source === "supabase"
                    ? "Necesidades leídas de Supabase"
                    : "Datos de la demo de AbasteceAI"}
                </strong>
                <p>
                  {agent.snapshot.source === "supabase"
                    ? "Lectura con tu sesión y RLS. Proveedores y mensajes siguen simulados."
                    : "Copia versionada de las vistas SQL; no es una consulta en vivo."}
                </p>
              </div>
            </div>
            <div className="ag-source-actions">
              <button
                className={`ag-button ag-small ${!agent.liveSelected ? "ag-selected" : "ag-outline"}`}
                onClick={agent.useSeed}
                disabled={agent.isLoading}
              >
                Datos de demo
              </button>
              <button
                className={`ag-button ag-small ${agent.liveSelected ? "ag-selected" : "ag-outline"}`}
                onClick={() => void agent.loadLive()}
                disabled={agent.isLoading}
              >
                {agent.isLoading ? "Leyendo…" : "Leer Supabase"}
              </button>
            </div>
          </section>
          {agent.error && (
            <div className="ag-error" role="alert">
              <ShieldCheck size={20} />
              <div>
                <strong>No se habilitó la lectura real</strong>
                <p>{agent.error}</p>
                <p>
                  No se continuará con datos de ejemplo de forma automática.
                  Elige «Datos de demo» para volver a la simulación.
                </p>
              </div>
            </div>
          )}

          <section className="ag-metrics" aria-label="Resumen de actividad">
            <div className="ag-metric">
              <span>Productos seleccionados</span>
              <strong>
                {agent.needs.length}
                <span>con necesidad de reposición</span>
              </strong>
              <ShoppingCart size={20} />
            </div>
            <div className="ag-metric">
              <span>Proveedores encontrados</span>
              <strong>
                {agent.step >= 1 ? "04" : "—"}
                <span>directorio ficticio</span>
              </strong>
              <Users size={20} />
            </div>
            <div className="ag-metric">
              <span>Proformas recibidas</span>
              <strong>
                {agent.step >= 3 ? "04" : "—"}
                <span>
                  {agent.step >= 3
                    ? "listas para comparar"
                    : "el agente aún no consultó"}
                </span>
              </strong>
              <FileText size={20} />
            </div>
            <div className="ag-metric ag-metric-status">
              <span>Estado de la recomendación</span>
              <strong>
                {canShowResult
                  ? "Por revisar"
                  : agent.running
                    ? "En proceso"
                    : "Por iniciar"}
              </strong>
              <Tag kind={canShowResult ? "amber" : "neutral"}>
                {canShowResult
                  ? "Aprobación humana pendiente"
                  : "Sin compras realizadas"}
              </Tag>
            </div>
          </section>

          <section className="ag-flow-panel" aria-labelledby="flow-heading">
            <div className="ag-section-top">
              <div>
                <div className="ag-section-label">EL AGENTE EN ACCIÓN</div>
                <h2 id="flow-heading">Deja que haga el trabajo previo</h2>
                <p>
                  Un recorrido visible, paso a paso. Tú decides cuándo avanzar.
                </p>
              </div>
              <div className="ag-controls">
                <button
                  className="ag-icon-button"
                  aria-label="Reiniciar recorrido"
                  onClick={agent.reset}
                  disabled={agent.step < 0}
                >
                  <RotateCcw size={17} />
                </button>
                {agent.running ? (
                  <button
                    className="ag-button ag-primary"
                    onClick={agent.pause}
                  >
                    <Pause size={16} /> Pausar
                  </button>
                ) : (
                  <button
                    className="ag-button ag-primary"
                    onClick={agent.start}
                    disabled={agent.blocked}
                  >
                    <Play size={16} />
                    {agent.ready
                      ? "Repetir demo"
                      : agent.step >= 0
                        ? "Continuar demo"
                        : "Iniciar agente demo"}
                  </button>
                )}
                <button
                  className="ag-button ag-outline"
                  onClick={agent.advance}
                  disabled={agent.blocked || agent.ready}
                >
                  Paso a paso <ArrowRight size={15} />
                </button>
              </div>
            </div>
            <ol className="ag-steps" aria-label="Etapas del agente">
              {steps.map((label, index) => {
                const Icon = stepIcons[index];
                const done = index < agent.step || agent.ready;
                const active = index === agent.step && !agent.ready;
                return (
                  <li
                    className={`ag-step ${done ? "ag-step-done" : active ? "ag-step-active" : ""}`}
                    key={label}
                    aria-current={active ? "step" : undefined}
                  >
                    <div className="ag-step-line">
                      <div className="ag-step-icon">
                        {done ? <Check size={21} /> : <Icon size={21} />}
                      </div>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {index < steps.length - 1 && <ChevronRight size={16} />}
                    </div>
                    <strong>{label}</strong>
                    <p>{stepDescriptions[index]}</p>
                  </li>
                );
              })}
            </ol>
            <div className="ag-flow-footer" aria-live="polite">
              <span
                className={`ag-status-dot ${agent.running ? "ag-pulse" : ""}`}
              />
              <span>
                {agent.step < 0
                  ? "Listo para comenzar. Elige productos abajo y ejecuta el recorrido."
                  : activity[agent.step]}
              </span>
              <span className="ag-flow-count">
                {Math.max(agent.step + 1, 0)} / 6
              </span>
            </div>
          </section>

          <div className="ag-middle-grid">
            <section className="ag-panel ag-inbox">
              <div className="ag-panel-heading">
                <div>
                  <div className="ag-section-label">COMUNICACIONES</div>
                  <h2>El agente conversa por ti</h2>
                </div>
                <Tag kind="amber">Sin envíos reales</Tag>
              </div>
              <div
                className="ag-channel-tabs"
                role="tablist"
                aria-label="Conversación con proveedor"
              >
                {suppliers.map((supplier) => (
                  <button
                    key={supplier.id}
                    id={`tab-${supplier.id}`}
                    role="tab"
                    aria-selected={selectedSupplier.id === supplier.id}
                    aria-controls="supplier-conversation"
                    onClick={() => setMessageTab(supplier.id)}
                    className={
                      selectedSupplier.id === supplier.id ? "ag-tab-active" : ""
                    }
                  >
                    {supplier.channel === "Correo" ? (
                      <Mail size={14} />
                    ) : (
                      <MessageCircle size={14} />
                    )}
                    {supplier.name.split(" ")[0]}
                    {agent.step >= 3 && <span className="ag-unread" />}
                  </button>
                ))}
              </div>
              <div
                className="ag-conversation"
                id="supplier-conversation"
                role="tabpanel"
                aria-labelledby={`tab-${selectedSupplier.id}`}
              >
                <div className="ag-conversation-header">
                  <div className="ag-avatar ag-avatar-brand">
                    {selectedSupplier.initials}
                  </div>
                  <div>
                    <strong>{selectedSupplier.name}</strong>
                    <p>
                      {selectedSupplier.channel} · {selectedSupplier.city} ·
                      proveedor ficticio
                    </p>
                  </div>
                  <Tag>{agent.step >= 3 ? "Respondió" : "Por consultar"}</Tag>
                </div>
                {agent.step < 2 ? (
                  <div className="ag-empty-conversation">
                    <div className="ag-empty-icon">
                      <MessageCircle size={29} />
                    </div>
                    <strong>Aquí verás cada consulta y respuesta</strong>
                    <p>
                      El agente solicitará disponibilidad, precio y plazo de
                      entrega para los productos seleccionados.
                    </p>
                    <span>
                      Correos y WhatsApp simulados dentro de esta pantalla.
                    </span>
                  </div>
                ) : (
                  <div className="ag-messages">
                    <div className="ag-message-label">
                      ABASTECEAI <span>· solicitud simulada</span>
                    </div>
                    <div className="ag-message ag-outgoing">
                      {requestText(agent.needs, agent.maxDays)}
                      <CheckCheck size={15} />
                    </div>
                    {agent.step >= 3 && selectedQuote && (
                      <>
                        <div className="ag-message-label">
                          {selectedSupplier.name.toUpperCase()}{" "}
                          <span>· respuesta ficticia</span>
                        </div>
                        <div className="ag-message ag-incoming">
                          <strong>
                            ¡Hola! Te compartimos nuestra proforma.
                          </strong>
                          <ul>
                            {selectedQuote.lines.map((line) => (
                              <li key={line.need.sku}>
                                <span>
                                  {line.need.sku} ·{" "}
                                  {quantity(line.need.quantity)}{" "}
                                  {line.need.unit.toLowerCase()}
                                </span>
                                <strong>
                                  {line.available >= line.need.quantity
                                    ? `${money(line.unitCents)} / unidad`
                                    : "Sin stock suficiente"}
                                </strong>
                              </li>
                            ))}
                          </ul>
                          <p>
                            Entrega: {selectedSupplier.days} días · Envío:{" "}
                            {money(selectedSupplier.shippingCents)}
                          </p>
                          <p>
                            Total cotizado:{" "}
                            <strong>{money(selectedQuote.totalCents)}</strong> ·
                            Sin impuestos
                          </p>
                          <span className="ag-message-disclaimer">
                            Respuesta predefinida para demostración.
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="ag-panel ag-recommendation">
              <div className="ag-panel-heading">
                <div>
                  <div className="ag-section-label ag-ai-label">
                    <Sparkles size={13} /> RECOMENDACIÓN DEL AGENTE
                  </div>
                  <h2>Lo importante, en un resumen</h2>
                </div>
              </div>
              {!canShowResult ? (
                <div className="ag-recommendation-waiting">
                  <div className="ag-orbit">
                    <Bot size={40} />
                    <span />
                    <span />
                    <span />
                  </div>
                  <h3>
                    {agent.running
                      ? "El agente está trabajando"
                      : "Tu decisión empieza con buenos datos"}
                  </h3>
                  <p>
                    {agent.step >= 4
                      ? "La comparación está lista. Falta preparar el informe para gerencia."
                      : "Aquí aparecerá la recomendación, con sus razones y las alternativas que se descartaron."}
                  </p>
                  <div>
                    <ShieldCheck size={16} /> Sin compras ni aprobaciones
                    automáticas
                  </div>
                </div>
              ) : (
                <div className="ag-recommendation-result">
                  <Tag kind={best ? "green" : "amber"}>
                    {best ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                    {best
                      ? "Oferta recomendada · SIMULADO"
                      : "Se requiere revisión humana"}
                  </Tag>
                  <h3>{best ? best.supplier.name : "Ninguna oferta cumple"}</h3>
                  <p>
                    {best
                      ? "Tiene todos los productos solicitados y el menor total entre las ofertas que cumplen el plazo."
                      : "Ajusta el plazo o solicita nuevas cotizaciones. No hay una opción que cumpla todas las condiciones."}
                  </p>
                  {best && (
                    <>
                      <div className="ag-price">
                        {money(best.totalCents)}
                        <span>Total ficticio con envío · sin impuestos</span>
                      </div>
                      <div className="ag-recommendation-facts">
                        <span>
                          <Truck size={16} /> Entrega en {best.supplier.days}{" "}
                          días
                        </span>
                        <span>
                          <PackageCheck size={16} /> Stock completo
                        </span>
                      </div>
                    </>
                  )}
                  <div className="ag-human-note">
                    <ShieldCheck size={18} />
                    <span>
                      Gerencia revisa la propuesta.
                      <br />
                      <strong>No se ha realizado ninguna compra.</strong>
                    </span>
                  </div>
                  <button
                    className="ag-button ag-outline ag-full"
                    onClick={() => setShowReport(true)}
                  >
                    <Mail size={16} /> Ver correo para gerencia{" "}
                    <ArrowRight size={16} />
                  </button>
                  <button className="ag-link-button" onClick={download}>
                    <ArrowDownToLine size={15} /> Descargar informe de ejemplo
                  </button>
                </div>
              )}
              <div className="ag-recommendation-footnote">
                Motor de presentación: reglas de código. No se invocó un modelo
                de IA ni se registró una decisión en Supabase.
              </div>
            </section>
          </div>

          <section className="ag-panel" id="necesidades">
            <div className="ag-panel-heading">
              <div>
                <div className="ag-section-label">EL PUNTO DE PARTIDA</div>
                <h2>Productos que necesitan atención</h2>
                <p>
                  Necesidades de los puntos de servicio; no son faltantes
                  calculados de la bodega central.
                </p>
              </div>
              <div className="ag-source-caption">
                <Database size={15} />
                <span>
                  {agent.snapshot.source === "supabase"
                    ? "Lectura real"
                    : "Copia de la vista SQL"}
                  <small>Reloj de negocio · {date}</small>
                </span>
              </div>
            </div>
            <div className="ag-products-scroll">
              <table className="ag-table">
                <caption className="ag-sr-only">
                  Productos con cobertura critical o attention; cantidades
                  sugeridas por v_replenishment
                </caption>
                <thead>
                  <tr>
                    <th>
                      <span className="ag-sr-only">Seleccionar</span>
                    </th>
                    <th>Producto</th>
                    <th>Cobertura mínima</th>
                    <th>Puntos con necesidad</th>
                    <th>Reposición sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.allNeeds.map((need) => (
                    <tr
                      key={need.sku}
                      className={
                        agent.selected.includes(need.sku)
                          ? "ag-row-selected"
                          : ""
                      }
                    >
                      <td>
                        <input
                          aria-label={`Seleccionar ${need.sku}`}
                          type="checkbox"
                          checked={agent.selected.includes(need.sku)}
                          onChange={() => agent.toggle(need.sku)}
                          disabled={agent.selectionBlocked}
                        />
                      </td>
                      <td>
                        <strong>{need.name}</strong>
                        <span className="ag-product-sku">
                          {need.sku} · {need.unit.toLowerCase()}
                        </span>
                      </td>
                      <td>
                        <Tag kind="amber">
                          <Clock3 size={13} />
                          {quantity(need.coverageDays)} días
                        </Tag>
                      </td>
                      <td>{need.points} puntos</td>
                      <td>
                        <strong>{quantity(need.quantity)}</strong>{" "}
                        <span className="ag-muted">
                          {need.unit.toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!agent.allNeeds.length && (
                <p className="ag-empty-inline">
                  No hay productos con necesidad de atención en la lectura
                  disponible.
                </p>
              )}
            </div>
            <div className="ag-table-note">
              <Circle size={9} /> Cantidades agregadas desde recommended_qty. La
              cobertura ya la calcula SQL; el agente no inventa cantidades.
            </div>
          </section>

          <section id="proveedores">
            <div className="ag-section-top">
              <div>
                <div className="ag-section-label">DIRECTORIO DE EJEMPLO</div>
                <h2>Cuatro proveedores. Distintas opciones.</h2>
                <p>
                  Empresas y condiciones ficticias creadas únicamente para
                  presentar este recorrido.
                </p>
              </div>
              <Tag>4 proveedores demo</Tag>
            </div>
            <div className="ag-suppliers">
              {suppliers.map((supplier) => (
                <article className="ag-panel ag-supplier" key={supplier.id}>
                  <div>
                    <span className="ag-avatar ag-supplier-avatar">
                      {supplier.initials}
                    </span>
                    <Tag kind={agent.step >= 3 ? "green" : "neutral"}>
                      {agent.step >= 3 ? "Proforma recibida" : "En directorio"}
                    </Tag>
                  </div>
                  <h3>{supplier.name}</h3>
                  <p>
                    {supplier.city} · {supplier.days} días de entrega
                  </p>
                  <div className="ag-supplier-bottom">
                    <span>
                      {supplier.channel === "Correo" ? (
                        <Mail size={15} />
                      ) : (
                        <MessageCircle size={15} />
                      )}
                      {supplier.channel}
                    </span>
                    <span>FICTICIO</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="ag-panel" id="comparativo">
            <div className="ag-panel-heading">
              <div>
                <div className="ag-section-label">
                  UNA COMPARACIÓN EXPLICABLE
                </div>
                <h2>Precio, disponibilidad y entrega</h2>
                <p>
                  Criterio de esta simulación: stock completo y plazo máximo;
                  después, el menor total con envío.
                </p>
              </div>
              <label className="ag-deadline">
                Plazo máximo
                <select
                  value={agent.maxDays}
                  onChange={(event) =>
                    agent.changeDays(Number(event.target.value))
                  }
                  disabled={agent.running || agent.isLoading}
                >
                  <option value={2}>2 días</option>
                  <option value={4}>4 días</option>
                  <option value={7}>7 días</option>
                </select>
              </label>
            </div>
            {agent.step < 4 || agent.blocked ? (
              <div className="ag-comparison-placeholder">
                <FileCheck2 size={25} />
                <div>
                  <strong>
                    Las ofertas aparecerán cuando el agente las compare
                  </strong>
                  <p>
                    También puedes cambiar el plazo y repetir la demo para ver
                    cómo cambia la recomendación.
                  </p>
                </div>
              </div>
            ) : (
              <div className="ag-table-responsive">
                <table className="ag-table ag-quotes-table">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Productos</th>
                      <th>Entrega</th>
                      <th>Total con envío</th>
                      <th>Evaluación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agent.quotes.map((quote) => (
                      <tr
                        key={quote.supplier.id}
                        className={quote === best ? "ag-row-best" : ""}
                      >
                        <td>
                          <strong>{quote.supplier.name}</strong>
                          {quote === best && (
                            <span className="ag-best-label">
                              <Sparkles size={12} /> Recomendada en esta
                              simulación
                            </span>
                          )}
                        </td>
                        <td>
                          {quote.lines.every((line) => line.complete) ? (
                            <span className="ag-stock-ok">
                              <Check size={14} /> Stock completo
                            </span>
                          ) : (
                            <span className="ag-stock-missing">
                              Stock incompleto
                            </span>
                          )}
                        </td>
                        <td>{quote.supplier.days} días</td>
                        <td>
                          <strong>{money(quote.totalCents)}</strong>
                          <small>Sin impuestos</small>
                        </td>
                        <td>
                          {quote.eligible ? (
                            <Tag kind="green">Cumple stock y plazo</Tag>
                          ) : (
                            <div className="ag-quote-issues">
                              {quote.issues.map((issue) => (
                                <span key={issue}>{issue}</span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <footer className="ag-footer">
            <span>
              <PackageCheck size={17} /> AbasteceAI{" "}
              <span>· Menos seguimiento manual. Mejores decisiones.</span>
            </span>
            <span>DEMO FICTICIA · source: SIMULADO</span>
          </footer>
        </main>
      </div>
      {showReport && canShowResult && (
        <div className="ag-modal-backdrop" onClick={() => setShowReport(false)}>
          <section
            className="ag-report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowReport(false);
              if (event.key === "Tab") {
                const buttons =
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  );
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === event.currentTarget)
                ) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
            tabIndex={-1}
            ref={reportDialog}
          >
            <div className="ag-panel-heading">
              <div>
                <div className="ag-section-label">
                  VISTA PREVIA · NO ENVIADO
                </div>
                <h2 id="report-title">Correo para gerencia</h2>
              </div>
              <button
                className="ag-icon-button"
                aria-label="Cerrar correo"
                onClick={() => setShowReport(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="ag-report-address">
              <span>
                <strong>Para</strong> Responsable de compras / gerencia
              </span>
              <Tag kind="amber">Destinatario ficticio</Tag>
            </div>
            <pre>{agent.report}</pre>
            <div className="ag-report-actions">
              <span>
                <ShieldCheck size={16} /> Pendiente de revisión humana
              </span>
              <button className="ag-button ag-primary" onClick={download}>
                <ArrowDownToLine size={16} /> Descargar borrador
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
