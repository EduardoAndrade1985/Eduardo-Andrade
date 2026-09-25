package com.rphub.app;

import android.app.Activity;
import android.os.AsyncTask;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.zebra.rfid.api3.Antennas;
import com.zebra.rfid.api3.ENUM_TRANSPORT;
import com.zebra.rfid.api3.HANDHELD_TRIGGER_EVENT_TYPE;
import com.zebra.rfid.api3.InvalidUsageException;
import com.zebra.rfid.api3.MEMORY_BANK;
import com.zebra.rfid.api3.OperationFailureException;
import com.zebra.rfid.api3.RFIDReader;
import com.zebra.rfid.api3.ReaderDevice;
import com.zebra.rfid.api3.Readers;
import com.zebra.rfid.api3.RfidEventsListener;
import com.zebra.rfid.api3.RfidReadEvents;
import com.zebra.rfid.api3.RfidStatusEvents;
import com.zebra.rfid.api3.STATUS_EVENT_TYPE;
import com.zebra.rfid.api3.TagAccess;
import com.zebra.rfid.api3.TagData;

import java.util.ArrayList;

public class ZebraRfidHandler implements RfidEventsListener {

    private static final String TAG = "ZebraRfid";

    private final Activity          activity;
    private final ZebraRfidPlugin   plugin;
    private       Readers           readers;
    private       ReaderDevice      readerDevice;
    private       RFIDReader        reader;

    public ZebraRfidHandler(Activity activity, ZebraRfidPlugin plugin) {
        this.activity = activity;
        this.plugin   = plugin;
    }

    // ── Conectar ──────────────────────────────────────────────────────────────

    public void conectar(final PluginCall call) {
        new AsyncTask<Void, Void, JSObject>() {
            String error = null;

            @Override
            protected JSObject doInBackground(Void... v) {
                try {
                    // Tenta Bluetooth primeiro, depois USB
                    readers = new Readers(activity, ENUM_TRANSPORT.BLUETOOTH);
                    ArrayList<ReaderDevice> lista = readers.GetAvailableRFIDReaderList();
                    Log.d(TAG, "BT readers found: " + (lista != null ? lista.size() : 0));

                    if (lista == null || lista.isEmpty()) {
                        readers.Dispose();
                        readers = new Readers(activity, ENUM_TRANSPORT.SERVICE_USB);
                        lista   = readers.GetAvailableRFIDReaderList();
                        Log.d(TAG, "USB readers found: " + (lista != null ? lista.size() : 0));
                    }

                    if (lista == null || lista.isEmpty()) {
                        error = "Nenhum leitor encontrado. Pareie o RFD8500 via Bluetooth nas configurações do Android.";
                        return null;
                    }

                    readerDevice = lista.get(0);
                    reader       = readerDevice.getRFIDReader();
                    Log.d(TAG, "Conectando a: " + readerDevice.getName());
                    reader.connect();
                    Log.d(TAG, "Conectado com sucesso");

                    // ── Eventos ──────────────────────────────────────────────
                    reader.Events.addEventsListener(ZebraRfidHandler.this);
                    reader.Events.setHandheldEvent(true);        // gatilho físico
                    reader.Events.setTagReadEvent(true);         // leituras de tag
                    reader.Events.setAttachTagDataWithReadEvent(true); // tag inclusa no evento
                    reader.Events.setInventoryStartEvent(true);  // log de início
                    reader.Events.setInventoryStopEvent(true);   // log de fim
                    reader.Events.setBatteryEvent(true);         // nível de bateria
                    Log.d(TAG, "Eventos registrados");

                    // ── Potência da antena (falha não é fatal) ────────────────
                    try {
                        Antennas.AntennaRfConfig cfg = reader.Config.Antennas.getAntennaRfConfig(1);
                        cfg.setTransmitPowerIndex(270);
                        cfg.setrfModeTableIndex(0);
                        cfg.setTari(0);
                        reader.Config.Antennas.setAntennaRfConfig(1, cfg);
                        Log.d(TAG, "Antena configurada: 27 dBm");
                    } catch (Exception e) {
                        Log.w(TAG, "Antenna config skipped: " + e.getMessage());
                    }

                    // Não configuramos triggers — usamos os padrões do SDK e controlamos
                    // o inventário via Inventory.perform() / Inventory.stop() por software.
                    Log.d(TAG, "Triggers: usando padrão do SDK");

                    String serial = "";
                    try { serial = reader.ReaderCapabilities.getSerialNumber(); } catch (Exception ignored) {}

                    JSObject r = new JSObject();
                    r.put("nome",    readerDevice.getName());
                    r.put("serial",  serial != null ? serial : "");
                    r.put("bateria", 100);
                    return r;

                } catch (Exception e) {
                    error = e.getMessage();
                    Log.e(TAG, "Erro ao conectar: " + e.getMessage());
                    return null;
                }
            }

            @Override
            protected void onPostExecute(JSObject result) {
                if (result != null) {
                    call.resolve(result);
                    plugin.notifyStatusChanged(true, 100, "Conectado: " + readerDevice.getName());
                } else {
                    String msg = error != null ? error : "Erro desconhecido ao conectar";
                    call.reject(msg);
                    plugin.notifyStatusChanged(false, 0, msg);
                }
            }
        }.execute();
    }

    // ── Desconectar ───────────────────────────────────────────────────────────

    public void desconectar(final PluginCall call) {
        new AsyncTask<Void, Void, Void>() {
            @Override
            protected Void doInBackground(Void... v) {
                try {
                    if (reader != null && reader.isConnected()) {
                        reader.Events.removeEventsListener(ZebraRfidHandler.this);
                        reader.disconnect();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Erro ao desconectar: " + e.getMessage());
                }
                try {
                    if (readers != null) readers.Dispose();
                } catch (Exception ignored) {}
                reader       = null;
                readerDevice = null;
                readers      = null;
                return null;
            }

            @Override
            protected void onPostExecute(Void v) {
                plugin.notifyStatusChanged(false, 0, "Desconectado");
                call.resolve();
            }
        }.execute();
    }

    // ── Estado ────────────────────────────────────────────────────────────────

    public void estaConectado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("connected", reader != null && reader.isConnected());
        call.resolve(r);
    }

    // ── Inventário ────────────────────────────────────────────────────────────

    public void iniciarInventario(final PluginCall call) {
        if (reader == null || !reader.isConnected()) {
            call.reject("Leitor não conectado");
            return;
        }
        new AsyncTask<Void, Void, String>() {
            @Override
            protected String doInBackground(Void... v) {
                try {
                    Log.d(TAG, "Chamando Inventory.perform()");
                    plugin.notifyStatusChanged(true, 100, "Iniciando inventário…");
                    reader.Actions.Inventory.perform();
                    Log.d(TAG, "Inventory.perform() retornou OK");
                    return null;
                } catch (Exception e) {
                    Log.e(TAG, "Inventory.perform() ERRO: " + e.getMessage());
                    return e.getMessage();
                }
            }

            @Override
            protected void onPostExecute(String err) {
                if (err == null) {
                    plugin.notifyStatusChanged(true, 100, "Inventário em curso — aproxime as etiquetas");
                    call.resolve();
                } else {
                    plugin.notifyStatusChanged(true, 0, "Erro inventário: " + err);
                    call.reject(err);
                }
            }
        }.execute();
    }

    public void pararInventario(final PluginCall call) {
        if (reader == null || !reader.isConnected()) {
            call.resolve();
            return;
        }
        new AsyncTask<Void, Void, Void>() {
            @Override
            protected Void doInBackground(Void... v) {
                try {
                    reader.Actions.Inventory.stop();
                    Log.d(TAG, "Inventory stopped via app");
                } catch (Exception ignored) {}
                return null;
            }

            @Override
            protected void onPostExecute(Void v) {
                plugin.notifyStatusChanged(true, 100, "Parado");
                call.resolve();
            }
        }.execute();
    }

    // ── Gravar EPC ────────────────────────────────────────────────────────────

    public void gravarEpc(final PluginCall call) {
        final String epcAtual = call.getString("epcAtual", "");
        final String epcNovo  = call.getString("epcNovo",  "");

        if (reader == null || !reader.isConnected()) { call.reject("Leitor não conectado"); return; }
        if (epcNovo == null || !epcNovo.matches("[0-9A-Fa-f]+") || epcNovo.length() % 4 != 0) {
            call.reject("EPC inválido — hexadecimal com múltiplo de 4 caracteres");
            return;
        }

        new AsyncTask<Void, Void, String>() {
            /** OperationFailureException traz o motivo real; getMessage() vem nulo. */
            private String descreverErro(Exception e) {
                if (e instanceof OperationFailureException) {
                    OperationFailureException op = (OperationFailureException) e;
                    String desc = op.getVendorMessage();
                    if (desc == null || desc.isEmpty()) desc = op.getStatusDescription();
                    if (desc == null || desc.isEmpty()) desc = String.valueOf(op.getResults());
                    return desc;
                }
                if (e instanceof InvalidUsageException) {
                    InvalidUsageException iu = (InvalidUsageException) e;
                    String desc = iu.getInfo();
                    if (desc != null && !desc.isEmpty()) return desc;
                }
                String m = e.getMessage();
                return (m == null || m.isEmpty()) ? e.getClass().getSimpleName() : m;
            }

            private void escrever() throws Exception {
                TagAccess tagAccess = new TagAccess();
                TagAccess.WriteAccessParams wp = tagAccess.new WriteAccessParams();
                wp.setWriteData(epcNovo);
                wp.setWriteRetries(3);
                wp.setMemoryBank(MEMORY_BANK.MEMORY_BANK_EPC);
                wp.setOffset(2);
                wp.setWriteDataLength(epcNovo.length() / 4);
                reader.Actions.TagAccess.writeWait(
                    (epcAtual == null || epcAtual.isEmpty()) ? null : epcAtual,
                    wp, null, null);
            }

            @Override
            protected String doInBackground(Void... v) {
                try {
                    escrever();
                    Log.d(TAG, "EPC gravado: " + epcNovo);
                    return null;
                } catch (Exception e) {
                    String motivo = descreverErro(e);
                    Log.w(TAG, "Falha ao gravar (tentativa 1): " + motivo);
                    // Uma segunda tentativa cobre o caso comum de a etiqueta ter saído
                    // do campo por um instante. Também recupera gravação parcial, pois
                    // o alvo é o EPC antigo, que ainda está lá se nada foi escrito.
                    try {
                        Thread.sleep(250);
                        escrever();
                        Log.d(TAG, "EPC gravado na 2a tentativa: " + epcNovo);
                        return null;
                    } catch (Exception e2) {
                        String motivo2 = descreverErro(e2);
                        Log.e(TAG, "Erro ao gravar EPC: " + motivo2);
                        return motivo2;
                    }
                }
            }

            @Override
            protected void onPostExecute(String err) {
                if (err == null) call.resolve();
                else             call.reject(err);
            }
        }.execute();
    }

    // ── Configurar ───────────────────────────────────────────────────────────

    public void configurar(PluginCall call) {
        Integer potencia = call.getInt("potenciaDbm");
        if (potencia != null && reader != null && reader.isConnected()) {
            try {
                Antennas.AntennaRfConfig cfg = reader.Config.Antennas.getAntennaRfConfig(1);
                cfg.setTransmitPowerIndex(Math.min(potencia * 10, 270));
                reader.Config.Antennas.setAntennaRfConfig(1, cfg);
            } catch (Exception e) {
                Log.e(TAG, "Erro ao configurar potência: " + e.getMessage());
            }
        }
        call.resolve();
    }

    // ── Callbacks do SDK Zebra ────────────────────────────────────────────────

    @Override
    public void eventReadNotify(RfidReadEvents e) {
        try {
            Log.d(TAG, "eventReadNotify disparado");

            // Abordagem 1: tag direto no evento (setAttachTagDataWithReadEvent = true)
            if (e.getReadEventData() != null && e.getReadEventData().tagData != null) {
                TagData td = e.getReadEventData().tagData;
                String epc = td.getTagID();
                Log.d(TAG, "Tag do evento: " + epc + " RSSI:" + td.getPeakRSSI());
                if (epc != null && !epc.isEmpty()) {
                    plugin.notifyTagRead(epc.toUpperCase(), (float) td.getPeakRSSI());
                }
            }

            // Abordagem 2: drenar buffer (garante que nenhuma tag seja perdida)
            TagData[] tags = reader.Actions.getReadTags(100);
            if (tags != null) {
                Log.d(TAG, "Tags do buffer: " + tags.length);
                for (TagData tag : tags) {
                    String epc = tag.getTagID();
                    if (epc != null && !epc.isEmpty()) {
                        Log.d(TAG, "Tag buffer: " + epc);
                        plugin.notifyTagRead(epc.toUpperCase(), (float) tag.getPeakRSSI());
                    }
                }
            }
        } catch (Exception ex) {
            Log.e(TAG, "Erro em eventReadNotify: " + ex.getMessage());
        }
    }

    @Override
    public void eventStatusNotify(RfidStatusEvents e) {
        STATUS_EVENT_TYPE type = e.StatusEventData.getStatusEventType();
        Log.d(TAG, "Status event: " + type);

        if (type == STATUS_EVENT_TYPE.DISCONNECTION_EVENT) {
            reader = null;
            plugin.notifyStatusChanged(false, 0, "Leitor desconectado");

        } else if (type == STATUS_EVENT_TYPE.BATTERY_EVENT) {
            try {
                int bat = e.StatusEventData.BatteryData.getLevel();
                plugin.notifyStatusChanged(true, bat, "Bateria: " + bat + "%");
            } catch (Exception ex) {
                Log.w(TAG, "Battery event error: " + ex.getMessage());
            }

        } else if (type == STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT) {
            // Gatilho físico do RFD8500: pressionar inicia inventário, soltar para
            try {
                HANDHELD_TRIGGER_EVENT_TYPE trigEvent =
                    e.StatusEventData.HandheldTriggerEventData.getHandheldEvent();
                Log.d(TAG, "Trigger event: " + trigEvent);

                if (trigEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED) {
                    // IMPORTANTE: nunca chamar Inventory.perform() diretamente no callback do SDK
                    // pois causa deadlock — usar Thread separada.
                    new Thread(() -> {
                        try {
                            reader.Actions.Inventory.perform();
                            Log.d(TAG, "Inventory started by physical trigger");
                        } catch (Exception ex) {
                            Log.e(TAG, "Erro trigger start: " + ex.getMessage());
                        }
                    }).start();
                    plugin.notifyStatusChanged(true, -1, "Lendo…");

                } else if (trigEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED) {
                    new Thread(() -> {
                        try {
                            reader.Actions.Inventory.stop();
                            Log.d(TAG, "Inventory stopped by physical trigger");
                        } catch (Exception ex) {
                            Log.e(TAG, "Erro trigger stop: " + ex.getMessage());
                        }
                    }).start();
                    plugin.notifyStatusChanged(true, -1, "Parado");
                }
            } catch (Exception ex) {
                Log.e(TAG, "Erro handheld trigger event: " + ex.getMessage());
            }

        } else if (type == STATUS_EVENT_TYPE.INVENTORY_START_EVENT) {
            Log.d(TAG, "INVENTORY STARTED — aguardando tags");
            plugin.notifyInventarioState(true);

        } else if (type == STATUS_EVENT_TYPE.INVENTORY_STOP_EVENT) {
            Log.d(TAG, "INVENTORY STOPPED");
            plugin.notifyInventarioState(false);
        }
    }
}
