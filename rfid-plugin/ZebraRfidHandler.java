package com.rphub.app;

import android.app.Activity;
import android.os.AsyncTask;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.zebra.rfid.api3.Antennas;
import com.zebra.rfid.api3.ENUM_TRANSPORT;
import com.zebra.rfid.api3.InvalidUsageException;
import com.zebra.rfid.api3.MEMORY_BANK;
import com.zebra.rfid.api3.OperationFailureException;
import com.zebra.rfid.api3.RFIDReader;
import com.zebra.rfid.api3.ReaderDevice;
import com.zebra.rfid.api3.Readers;
import com.zebra.rfid.api3.RfidEventsListener;
import com.zebra.rfid.api3.RfidReadEvents;
import com.zebra.rfid.api3.RfidStatusEvents;
import com.zebra.rfid.api3.START_TRIGGER_TYPE;
import com.zebra.rfid.api3.STATUS_EVENT_TYPE;
import com.zebra.rfid.api3.STOP_TRIGGER_TYPE;
import com.zebra.rfid.api3.TagAccess;
import com.zebra.rfid.api3.TagData;
import com.zebra.rfid.api3.TriggerInfo;

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

                    if (lista == null || lista.isEmpty()) {
                        readers.Dispose();
                        readers = new Readers(activity, ENUM_TRANSPORT.USB);
                        lista   = readers.GetAvailableRFIDReaderList();
                    }

                    if (lista == null || lista.isEmpty()) {
                        error = "Nenhum leitor encontrado. Pareie o RFD8500 via Bluetooth nas configurações do Android.";
                        return null;
                    }

                    readerDevice = lista.get(0);
                    reader       = readerDevice.getRFIDReader();
                    reader.connect();

                    // Registra ouvintes de eventos
                    reader.Events.addEventsListener(ZebraRfidHandler.this);
                    reader.Events.setHandheldEvent(true);
                    reader.Events.setTagReadEvent(true);
                    reader.Events.setAttachTagDataWithReadEvent(false);

                    // Potência da antena: máximo (270 = 27.0 dBm)
                    Antennas.AntennaRfConfig cfg = reader.Config.Antennas.getAntennaRfConfig(1);
                    cfg.setTransmitPowerIndex(270);
                    cfg.setrfModeTableIndex(0);
                    cfg.setTari(0);
                    reader.Config.Antennas.setAntennaRfConfig(1, cfg);

                    // Trigger por software: inicia/para via código
                    TriggerInfo trig = new TriggerInfo();
                    trig.StartTrigger.setTriggerType(START_TRIGGER_TYPE.START_TRIGGER_TYPE_IMMEDIATE);
                    trig.StopTrigger.setTriggerType(STOP_TRIGGER_TYPE.STOP_TRIGGER_TYPE_IMMEDIATE);
                    reader.Config.setTriggerInfo(trig);

                    String serial = "";
                    try { serial = reader.ReaderCapabilities.SerialNumber; }
                    catch (Exception ignored) {}

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
                    reader.Actions.Inventory.perform();
                    return null;
                } catch (Exception e) {
                    return e.getMessage();
                }
            }

            @Override
            protected void onPostExecute(String err) {
                if (err == null) {
                    plugin.notifyStatusChanged(true, 100, "Lendo…");
                    call.resolve();
                } else {
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
                try { reader.Actions.Inventory.stop(); } catch (Exception ignored) {}
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
            @Override
            protected String doInBackground(Void... v) {
                try {
                    TagAccess tagAccess = new TagAccess();
                    TagAccess.WriteAccessParams wp = tagAccess.new WriteAccessParams();
                    wp.setWriteData(epcNovo);
                    wp.setWriteRetries(3);
                    wp.setMemoryBank(MEMORY_BANK.MEMORY_BANK_EPC);
                    wp.setOffset(2);  // word offset: pula CRC e PC
                    wp.setWriteDataLength(epcNovo.length() / 4);
                    reader.Actions.TagAccess.writeWait(
                        (epcAtual == null || epcAtual.isEmpty()) ? null : epcAtual,
                        wp, null);
                    return null;
                } catch (Exception e) {
                    return e.getMessage();
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
                // índice em 0.1 dBm (ex: 30 dBm → 300, mas max aceito é 270 = 27 dBm)
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
        // Chamado em background thread a cada burst de leituras
        try {
            TagData[] tags = reader.Actions.getReadTags(100);
            if (tags == null) return;
            for (TagData tag : tags) {
                String epc = tag.getTagID();
                if (epc != null && !epc.isEmpty()) {
                    plugin.notifyTagRead(epc.toUpperCase(), tag.getPeakRSSI());
                }
            }
        } catch (Exception ex) {
            Log.e(TAG, "Erro ao processar leitura: " + ex.getMessage());
        }
    }

    @Override
    public void eventStatusNotify(RfidStatusEvents e) {
        STATUS_EVENT_TYPE type = e.StatusEventData.getStatusEventType();
        if (type == STATUS_EVENT_TYPE.DISCONNECTION_EVENT) {
            reader = null;
            plugin.notifyStatusChanged(false, 0, "Leitor desconectado");
        } else if (type == STATUS_EVENT_TYPE.BATTERY_EVENT) {
            int bat = e.StatusEventData.BatteryData.getLevel();
            plugin.notifyStatusChanged(true, bat, "Bateria: " + bat + "%");
        }
    }
}
