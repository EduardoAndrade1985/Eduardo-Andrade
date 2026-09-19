/**
 * frontend/src/services/rfid.js
 *
 * Camada de abstração do leitor RFID.
 *
 * POR QUE ESTA CAMADA EXISTE
 * As telas nunca falam com o SDK da Zebra direto. Elas falam com esta
 * interface. Isso permite duas coisas:
 *
 *   1. Desenvolver e demonstrar o módulo inteiro no navegador, sem leitor,
 *      usando a implementação mock.
 *   2. Trocar o RFD8500 por um RFD40, um portal fixo ou outro fabricante
 *      mexendo em um arquivo só.
 *
 * A implementação real (Capacitor + SDK Zebra) entra depois em
 * ./rfid.capacitor.js e é selecionada automaticamente aqui embaixo.
 */

// ---------------------------------------------------------------
// CONTRATO
// ---------------------------------------------------------------
//
// Toda implementação precisa expor estes métodos:
//
//   conectar()                    -> Promise<{ nome, serial, bateria }>
//   desconectar()                 -> Promise<void>
//   estaConectado()               -> Promise<boolean>
//   iniciarInventario(opcoes)     -> Promise<void>
//   pararInventario()             -> Promise<void>
//   gravarEpc({ epcAtual, epcNovo }) -> Promise<void>
//   configurar({ potenciaDbm, sessionGen2 }) -> Promise<void>
//   onTag(callback)               -> função de cancelamento
//   onStatus(callback)            -> função de cancelamento
//
// Callback de tag recebe: { epc, rssi, contagem, lidaEm }
// Callback de status recebe: { conectado, bateria, mensagem }

export const StatusLeitor = {
  DESCONECTADO: "desconectado",
  CONECTANDO: "conectando",
  CONECTADO: "conectado",
  LENDO: "lendo",
  ERRO: "erro",
};

// Peças de exemplo para o mock. Os EPCs com prefixo A100 simulam tags
// já regravadas; os 0000... simulam tags de fábrica, como as do teste real.
const EPCS_SIMULADOS = [
  "A10000010000000100000001",
  "A10000010000000100000002",
  "A10000010000000100000003",
  "A10000020000000100000004",
  "A10000020000000100000005",
  "A10000030000000100000006",
  "A10000030000000100000007",
  "A10000030000000100000008",
  "000000000000000000001669",
  "000000000000000000000839",
  "000000000000000000001373",
  "000000000000000000002739",
];

// Tags de terceiros que aparecem no ambiente real. O mock as inclui de
// propósito para você testar o filtro de prefixo desde o início.
const EPCS_ESTRANHOS = [
  "AAA10000375FFE31000006C5",
  "E40150289410010000F556B6",
  "E30157247430020000F5569B",
  "3BE2000020B7B9D300000FF9",
];

// ---------------------------------------------------------------
// IMPLEMENTAÇÃO MOCK
// ---------------------------------------------------------------

class RfidMock {
  constructor() {
    this.conectado = false;
    this.lendo = false;
    this.timer = null;
    this.ouvintesTag = new Set();
    this.ouvintesStatus = new Set();
    this.vistos = new Map(); // epc -> contagem
    this.config = { potenciaDbm: 30, sessionGen2: 1 };
  }

  _emitirStatus(payload) {
    this.ouvintesStatus.forEach((cb) => cb(payload));
  }

  async conectar() {
    this._emitirStatus({ conectado: false, mensagem: "Conectando..." });
    await new Promise((r) => setTimeout(r, 600));
    this.conectado = true;
    const info = {
      nome: "RFD8500 (simulado)",
      serial: "MOCK-0000000000",
      bateria: 77,
    };
    this._emitirStatus({ conectado: true, bateria: 77, mensagem: "Conectado" });
    return info;
  }

  async desconectar() {
    this.pararInventario();
    this.conectado = false;
    this._emitirStatus({ conectado: false, mensagem: "Desconectado" });
  }

  async estaConectado() {
    return this.conectado;
  }

  async configurar(opcoes = {}) {
    this.config = { ...this.config, ...opcoes };
  }

  /**
   * Simula uma sessão de leitura.
   *
   * O comportamento imita o real de propósito:
   *  - tags chegam aos poucos, não todas de uma vez
   *  - a mesma tag reaparece várias vezes (por isso a contagem)
   *  - RSSI varia, e algumas tags ficam no limite (sinal fraco, poucas leituras)
   *  - tags de terceiros entram no meio
   *
   * @param {object} opcoes
   * @param {number} opcoes.totalEsperado  quantas peças "existem" no campo
   * @param {number} opcoes.taxaLeitura    0..1 — quanto do total será lido
   */
  async iniciarInventario(opcoes = {}) {
    if (!this.conectado) throw new Error("Leitor não conectado.");

    const { totalEsperado = 12, taxaLeitura = 0.92 } = opcoes;

    this.lendo = true;
    this.vistos.clear();
    this._emitirStatus({ conectado: true, mensagem: "Lendo..." });

    // Sorteia quais peças serão efetivamente encontradas.
    const universo = [...EPCS_SIMULADOS].slice(0, totalEsperado);
    const qtdLida = Math.round(universo.length * taxaLeitura);
    const alcancaveis = universo
      .sort(() => Math.random() - 0.5)
      .slice(0, qtdLida);

    // Sempre inclui tags de terceiros — o filtro precisa lidar com elas.
    const campo = [...alcancaveis, ...EPCS_ESTRANHOS.slice(0, 2)];

    this.timer = setInterval(() => {
      if (!this.lendo) return;

      // 1 a 3 leituras por ciclo, como o burst real do leitor.
      const quantas = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < quantas; i++) {
        const epc = campo[Math.floor(Math.random() * campo.length)];
        const contagem = (this.vistos.get(epc) || 0) + 1;
        this.vistos.set(epc, contagem);

        this.ouvintesTag.forEach((cb) =>
          cb({
            epc,
            rssi: -40 - Math.floor(Math.random() * 30), // -40 a -70
            contagem,
            lidaEm: new Date().toISOString(),
          })
        );
      }
    }, 250);
  }

  async pararInventario() {
    this.lendo = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.conectado) {
      this._emitirStatus({ conectado: true, mensagem: "Parado" });
    }
  }

  /**
   * Simula gravação de EPC.
   * No real isso exige o leitor bem próximo da tag (10-20 cm) e
   * falha com frequência — por isso o mock também falha às vezes.
   */
  async gravarEpc({ epcAtual, epcNovo }) {
    if (!this.conectado) throw new Error("Leitor não conectado.");
    if (!/^[0-9A-Fa-f]+$/.test(epcNovo)) {
      throw new Error("EPC deve ser hexadecimal (0-9, A-F).");
    }
    if (epcNovo.length % 4 !== 0) {
      throw new Error("EPC deve ter múltiplo de 4 caracteres hex.");
    }
    await new Promise((r) => setTimeout(r, 400));
    if (Math.random() < 0.1) {
      throw new Error("Falha na gravação. Aproxime o leitor da etiqueta.");
    }
  }

  onTag(cb) {
    this.ouvintesTag.add(cb);
    return () => this.ouvintesTag.delete(cb);
  }

  onStatus(cb) {
    this.ouvintesStatus.add(cb);
    return () => this.ouvintesStatus.delete(cb);
  }
}

// ---------------------------------------------------------------
// IMPLEMENTAÇÃO CAPACITOR (Android + SDK Zebra)
// ---------------------------------------------------------------
//
// Ativa automaticamente quando o app roda dentro do Capacitor Android.
// O plugin ZebraRfidPlugin.java + ZebraRfidHandler.java devem estar
// instalados no projeto Android (ver rfid-plugin/ na raiz do projeto).

class RfidCapacitorWrapped {
  constructor(plugin) {
    this.plugin          = plugin;
    this.ouvintesTag     = new Set();
    this.ouvintesStatus  = new Set();
    this._removeListeners = null;
  }

  async conectar() {
    // Registra os listeners de eventos antes de conectar
    const [h1, h2] = await Promise.all([
      this.plugin.addListener("tagRead", (d) => {
        this.ouvintesTag.forEach((cb) =>
          cb({ epc: d.epc, rssi: d.rssi, contagem: 1, lidaEm: new Date().toISOString() })
        );
      }),
      this.plugin.addListener("statusChanged", (d) => {
        this.ouvintesStatus.forEach((cb) =>
          cb({ conectado: d.connected, bateria: d.battery, mensagem: d.message })
        );
      }),
    ]);
    this._removeListeners = () => { h1.remove(); h2.remove(); };

    const r = await this.plugin.conectar();
    return { nome: r.nome, serial: r.serial, bateria: r.bateria };
  }

  async desconectar() {
    await this.plugin.desconectar();
    if (this._removeListeners) { this._removeListeners(); this._removeListeners = null; }
  }

  async estaConectado() {
    const r = await this.plugin.estaConectado();
    return r.connected;
  }

  async iniciarInventario(opcoes = {}) {
    await this.plugin.iniciarInventario(opcoes);
  }

  async pararInventario() {
    await this.plugin.pararInventario();
  }

  async gravarEpc({ epcAtual, epcNovo }) {
    await this.plugin.gravarEpc({ epcAtual, epcNovo });
  }

  async configurar(opcoes = {}) {
    await this.plugin.configurar(opcoes);
  }

  onTag(cb) {
    this.ouvintesTag.add(cb);
    return () => this.ouvintesTag.delete(cb);
  }

  onStatus(cb) {
    this.ouvintesStatus.add(cb);
    return () => this.ouvintesStatus.delete(cb);
  }
}

// ---------------------------------------------------------------
// SELEÇÃO DA IMPLEMENTAÇÃO
// ---------------------------------------------------------------

function criarLeitor() {
  // Plugin nativo registrado pelo Capacitor (Android com SDK Zebra)
  const pluginNativo =
    typeof window !== "undefined" &&
    window.Capacitor?.isNativePlatform?.() &&
    window.Capacitor?.Plugins?.ZebraRfid;

  if (pluginNativo) {
    console.log("[rfid] Usando leitor nativo Zebra (Capacitor Android)");
    return new RfidCapacitorWrapped(pluginNativo);
  }

  // Navegador: mock para desenvolvimento e demonstração
  console.log("[rfid] Usando mock (browser sem Capacitor)");
  return new RfidMock();
}

export const rfid = criarLeitor();
export { RfidMock };

// ---------------------------------------------------------------
// UTILITÁRIOS DE EPC
// ---------------------------------------------------------------

/**
 * Normaliza: maiúsculo, sem espaços.
 * Evita o bug de 'a100...' não bater com 'A100...'.
 */
export function normalizarEpc(epc) {
  return (epc || "").trim().toUpperCase();
}

/** Valida formato hexadecimal com tamanho múltiplo de 4. */
export function epcValido(epc) {
  const e = normalizarEpc(epc);
  return /^[0-9A-F]+$/.test(e) && e.length % 4 === 0;
}

/** Filtro de prefixo: descarta tags que não são do sistema. */
export function epcDoSistema(epc, prefixo) {
  if (!prefixo) return true;
  return normalizarEpc(epc).startsWith(normalizarEpc(prefixo));
}

/**
 * Monta um EPC-96 estruturado.
 *
 *   A100  0001    00000001              00000000
 *   │     │       │                     └── reservado
 *   │     │       └── serial da peça
 *   │     └── código do tipo
 *   └── prefixo do sistema
 *
 * Só aceita caracteres hex: as letras vão de A a F.
 */
export function montarEpc({ prefixo = "A100", tipoCodigo, serial }) {
  const t = String(tipoCodigo).padStart(4, "0").toUpperCase();
  const s = Number(serial).toString(16).padStart(8, "0").toUpperCase();
  const epc = `${prefixo}${t}${s}`.padEnd(24, "0");
  if (!epcValido(epc)) throw new Error(`EPC inválido gerado: ${epc}`);
  return epc;
}
