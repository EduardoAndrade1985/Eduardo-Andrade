package com.rphub.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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
        // Android 12+ exige permissão BLUETOOTH_CONNECT em runtime
        if (getPermissionState("bluetoothConnect") != PermissionState.GRANTED) {
            requestAllPermissions(call, "permissaoBluetooth");
            return;
        }
        handler.conectar(call);
    }

    @PermissionCallback
    private void permissaoBluetooth(PluginCall call) {
        if (getPermissionState("bluetoothConnect") == PermissionState.GRANTED) {
            handler.conectar(call);
        } else {
            call.reject("Permissão Bluetooth negada. Vá em Configurações → Aplicativos → RPHub → Permissões e ative Bluetooth.");
        }
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
        // Dispara window CustomEvent diretamente no WebView — contorna qualquer
        // problema de entrega do notifyListeners em Capacitor 8.
        String safe = epc.replace("\\", "\\\\").replace("'", "\\'");
        String js = "window.dispatchEvent(new CustomEvent('rfidTagRead',{detail:{epc:'" + safe + "',rssi:" + rssi + "}}))";
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(js, null)
        );
    }

    public void notifyStatusChanged(boolean connected, int battery, String message) {
        String safeMsg = (message == null ? "" : message)
            .replace("\\", "\\\\").replace("'", "\\'");
        String js = "window.dispatchEvent(new CustomEvent('rfidStatusChanged',{detail:{connected:"
            + connected + ",battery:" + battery + ",message:'" + safeMsg + "'}}))";
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(js, null)
        );
    }

    /** Estado do inventário — dispara também no gatilho físico, não só no botão do app. */
    public void notifyInventarioState(boolean ativo) {
        String js = "window.dispatchEvent(new CustomEvent('rfidInventario',{detail:{ativo:"
            + ativo + "}}))";
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(js, null)
        );
    }
}
