/**
 * frontend/src/hooks/useRfid.js
 *
 * Hook que encapsula a sessão de leitura.
 *
 * A responsabilidade dele é uma só: transformar o fluxo caótico de eventos
 * do leitor (a mesma tag chegando 150 vezes) numa lista limpa de EPCs
 * únicos, com contagem e RSSI, pronta para a tela e para a API.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { rfid, StatusLeitor, epcDoSistema, normalizarEpc } from "../services/rfid";

export function useRfid({ prefixo = "", rssiMinimo = null } = {}) {
  const [status, setStatus] = useState(StatusLeitor.DESCONECTADO);
  const [info, setInfo] = useState(null);       // { nome, serial, bateria }
  const [erro, setErro] = useState(null);
  const [tags, setTags] = useState([]);         // lista renderizada
  const [lendo, setLendo] = useState(false);

  // O acumulador fica em ref, não em state: o leitor dispara dezenas de
  // eventos por segundo e um setState por evento derrubaria a performance.
  const acumulador = useRef(new Map());
  const timerRender = useRef(null);

  // Repinta a tela no máximo 4x por segundo, independente do volume de leituras.
  const agendarRender = useCallback(() => {
    if (timerRender.current) return;
    timerRender.current = setTimeout(() => {
      timerRender.current = null;
      setTags(
        Array.from(acumulador.current.values()).sort(
          (a, b) => (b.rssi ?? -99) - (a.rssi ?? -99)
        )
      );
    }, 250);
  }, []);

  useEffect(() => {
    const cancelarTag = rfid.onTag((tag) => {
      const epc = normalizarEpc(tag.epc);
      const anterior = acumulador.current.get(epc);

      acumulador.current.set(epc, {
        epc,
        // Guarda o melhor sinal já visto, não o último.
        // O último pode ser um eco fraco de uma tag que estava próxima.
        rssi: Math.max(tag.rssi ?? -99, anterior?.rssi ?? -99),
        contagem: (anterior?.contagem ?? 0) + 1,
        primeiraLeitura: anterior?.primeiraLeitura ?? tag.lidaEm,
        ultimaLeitura: tag.lidaEm,
        doSistema: epcDoSistema(epc, prefixo),
        // Leitura no limite do campo: pode ser peça da prateleira vizinha.
        suspeita:
          rssiMinimo !== null &&
          (tag.rssi ?? -99) < rssiMinimo &&
          (anterior?.contagem ?? 0) < 3,
      });

      agendarRender();
    });

    const cancelarStatus = rfid.onStatus((s) => {
      // Eventos de inventário só trazem { lendo } — não mexem no estado de conexão.
      if (s.lendo !== undefined) {
        setLendo(s.lendo);
        setStatus(s.lendo ? StatusLeitor.LENDO : StatusLeitor.CONECTADO);
        return;
      }
      setStatus(s.conectado ? StatusLeitor.CONECTADO : StatusLeitor.DESCONECTADO);
      if (s.bateria != null && s.bateria >= 0) {
        setInfo((atual) => ({ ...(atual || {}), bateria: s.bateria }));
      }
    });

    return () => {
      cancelarTag();
      cancelarStatus();
      if (timerRender.current) clearTimeout(timerRender.current);
    };
  }, [prefixo, rssiMinimo, agendarRender]);

  const conectar = useCallback(async () => {
    setErro(null);
    setStatus(StatusLeitor.CONECTANDO);
    try {
      const dados = await rfid.conectar();
      setInfo(dados);
      setStatus(StatusLeitor.CONECTADO);
      return dados;
    } catch (e) {
      setErro(e.message);
      setStatus(StatusLeitor.ERRO);
      throw e;
    }
  }, []);

  const desconectar = useCallback(async () => {
    await rfid.desconectar();
    setStatus(StatusLeitor.DESCONECTADO);
    setInfo(null);
  }, []);

  const iniciar = useCallback(async (opcoes) => {
    setErro(null);
    try {
      await rfid.iniciarInventario(opcoes);
      setLendo(true);
      setStatus(StatusLeitor.LENDO);
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }, []);

  const parar = useCallback(async () => {
    await rfid.pararInventario();
    setLendo(false);
    setStatus(StatusLeitor.CONECTADO);
  }, []);

  /** Zera o acumulado. Use antes de cada nova sessão. */
  const limpar = useCallback(() => {
    acumulador.current.clear();
    setTags([]);
  }, []);

  /** Payload no formato que a API espera em registrar_leituras(). */
  const paraApi = useCallback(
    () =>
      Array.from(acumulador.current.values())
        .filter((t) => t.doSistema)
        .map(({ epc, rssi, contagem }) => ({ epc, rssi, contagem })),
    []
  );

  const validas = tags.filter((t) => t.doSistema);

  return {
    status,
    info,
    erro,
    lendo,
    conectado: status === StatusLeitor.CONECTADO || status === StatusLeitor.LENDO,

    tags,                                   // tudo, inclusive tags de terceiros
    tagsValidas: validas,                   // só as do sistema
    totalUnico: validas.length,
    totalIgnorado: tags.length - validas.length,
    totalSuspeito: validas.filter((t) => t.suspeita).length,

    conectar,
    desconectar,
    iniciar,
    parar,
    limpar,
    paraApi,
    gravarEpc: rfid.gravarEpc.bind(rfid),
    configurar: rfid.configurar.bind(rfid),
  };
}
