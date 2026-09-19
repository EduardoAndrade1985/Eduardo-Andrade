package com.rphub.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Plugin Capacitor que expõe o leitor RFID Zebra RFD8500 para o JavaScript.
 *
 * Após rodar "npx cap add android", copie este arquivo e ZebraRfidHandler.java para:
 *   android/app/src/main/java/com/rphub/app/
 *
 * Depois registre no MainActivity.java:
 *   add(ZebraRfidPlugin.class);
 */
@CapacitorPlugin(
    name = "ZebraRfid",
    permissions = {
        @Permission(strings = {Manifest.permission.BLUETOOTH},            alias = "bluetooth"),
        @Permission(strings = {Manifest.permission.BLUETOOTH_ADMIN},      alias = "bluetoothAdmin"),
        @Permission(strings = {Manifest.permission.BLUETOOTH_CONNECT},    alias = "bluetoothConnect"),
        @Permission(strings = {Manifest.permission.BLUETOOTH_SCAN},       alias = "bluetoothScan"),
        @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION}, alias = "location"),
    }
)
public class ZebraRfidPlugin extends Plugin {

    private ZebraRfidHandler handler;

    @Override
    public void load() {
        handler = new ZebraRfidHandler(getActivity(), this);
    }

    @PluginMethod
    public void conectar(PluginCall call) {
        handler.conectar(call);
    }

    @PluginMethod
    public void desconectar(PluginCall call) {
        handler.desconectar(call);
    }

    @PluginMethod
    public void estaConectado(PluginCall call) {
        handler.estaConectado(call);
    }

    @PluginMethod
    public void iniciarInventario(PluginCall call) {
        handler.iniciarInventario(call);
    }

    @PluginMethod
    public void pararInventario(PluginCall call) {
        handler.pararInventario(call);
    }

    @PluginMethod
    public void gravarEpc(PluginCall call) {
        handler.gravarEpc(call);
    }

    @PluginMethod
    public void configurar(PluginCall call) {
        handler.configurar(call);
    }

    // Chamados pelo handler para emitir eventos ao JavaScript
    public void notifyTagRead(String epc, float rssi) {
        JSObject data = new JSObject();
        data.put("epc",  epc);
        data.put("rssi", rssi);
        notifyListeners("tagRead", data);
    }

    public void notifyStatusChanged(boolean connected, int battery, String message) {
        JSObject data = new JSObject();
        data.put("connected", connected);
        data.put("battery",   battery);
        data.put("message",   message);
        notifyListeners("statusChanged", data);
    }
}
