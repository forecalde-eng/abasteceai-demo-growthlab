import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seedSnapshot, suppliers } from "./fixtures";
import {
  collectNeeds,
  compareQuotes,
  reportText,
  type Snapshot,
} from "./model";
import { readLiveSnapshot } from "./repository";
import { getSupabaseClient, hasSupabaseConfig } from "../supabase";

export const steps = [
  "Detectar necesidades",
  "Buscar proveedores",
  "Solicitar proformas",
  "Recibir respuestas",
  "Comparar opciones",
  "Preparar recomendación",
];
const initialSkus = ["INS-002", "INS-005", "INS-016"];

export function useAgentDemo() {
  const [snapshot, setSnapshot] = useState<Snapshot>(seedSnapshot);
  const [selected, setSelected] = useState<string[]>(initialSkus);
  const [maxDays, setMaxDays] = useState(4);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSelected, setLiveSelected] = useState(false);
  const [validLiveSession, setValidLiveSession] = useState(true);
  const readGeneration = useRef(0);
  const allNeeds = useMemo(() => collectNeeds(snapshot), [snapshot]);
  const needs = useMemo(
    () => allNeeds.filter((need) => selected.includes(need.sku)),
    [allNeeds, selected],
  );
  const quotes = useMemo(
    () => compareQuotes(needs, suppliers, maxDays),
    [needs, maxDays],
  );
  const ready = step === steps.length - 1;
  const reset = useCallback(() => {
    setStep(-1);
    setRunning(false);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(
      () => {
        setStep((current) => {
          const next = Math.min(current + 1, steps.length - 1);
          return next;
        });
      },
      step < 0 ? 350 : 1600,
    );
    return () => window.clearTimeout(timer);
  }, [running, step]);
  useEffect(() => {
    if (ready) setRunning(false);
  }, [ready]);

  useEffect(() => {
    if (!liveSelected || !hasSupabaseConfig()) return;
    const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_OUT" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED"
      ) {
        readGeneration.current += 1;
        reset();
        setSnapshot(seedSnapshot);
        setSelected(initialSkus);
        setValidLiveSession(false);
        setError(
          "La sesión cambió. Vuelve a leer la base antes de usar datos reales.",
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, [reset, liveSelected]);

  useEffect(
    () => () => {
      readGeneration.current += 1;
    },
    [],
  );

  const loadLive = async () => {
    const generation = ++readGeneration.current;
    reset();
    setLoading(true);
    setError(null);
    setLiveSelected(true);
    setValidLiveSession(false);
    try {
      if (!hasSupabaseConfig())
        throw new Error(
          "Falta configurar la URL y la publishable key del frontend. No introduzcas claves secretas aquí.",
        );
      const data = await readLiveSnapshot(getSupabaseClient());
      if (generation !== readGeneration.current) return;
      const found = collectNeeds(data);
      setSnapshot(data);
      setSelected(
        found
          .filter((need) => initialSkus.includes(need.sku))
          .map((need) => need.sku),
      );
      setValidLiveSession(true);
    } catch (cause) {
      if (generation === readGeneration.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "No fue posible leer la base.",
        );
    } finally {
      setLoading(false);
    }
  };
  const useSeed = () => {
    readGeneration.current += 1;
    reset();
    setLiveSelected(false);
    setValidLiveSession(true);
    setSnapshot(seedSnapshot);
    setSelected(initialSkus);
    setError(null);
  };
  const toggle = (sku: string) => {
    reset();
    setSelected((current) =>
      current.includes(sku)
        ? current.filter((item) => item !== sku)
        : [...current, sku],
    );
  };
  const changeDays = (value: number) => {
    reset();
    setMaxDays(value);
  };
  const blocked =
    isLoading || (liveSelected && !validLiveSession) || !needs.length;
  return {
    snapshot,
    allNeeds,
    selected,
    needs,
    quotes,
    maxDays,
    changeDays,
    toggle,
    step,
    running,
    ready,
    isLoading,
    error,
    liveSelected,
    blocked,
    loadLive,
    useSeed,
    reset,
    start: () => {
      if (!blocked) {
        if (ready) setStep(-1);
        setRunning(true);
      }
    },
    pause: () => setRunning(false),
    advance: () => {
      if (!blocked) {
        setRunning(false);
        setStep((current) => Math.min(current + 1, steps.length - 1));
      }
    },
    report:
      ready && !blocked ? reportText(snapshot, needs, quotes, maxDays) : "",
  };
}
