# Como conectar o RFD8500 ao sistema

## Arquitetura

```
RFD8500 ──Bluetooth──► celular Android ──► APK (Capacitor + React)
                                                      │
                                              HTTPS   │
                                                      ▼
                                          Django API (Render)
```

## Pré-requisitos

- Android Studio instalado no PC
- Celular Android (Android 9+)
- RFD8500 carregado

---

## Passo 1 — Instalar Capacitor

No terminal, dentro da pasta `frontend/`:

```bash
cd frontend
npm install @capacitor/core @capacitor/android @capacitor/cli
npx cap add android
```

Isso cria a pasta `frontend/android/`.

---

## Passo 2 — Copiar o SDK Zebra

Descompacte `Zebra_RFIDAPI3_SDK_2.0.5.297.zip` (está no seu Desktop).

Copie o arquivo `.aar` para dentro do projeto Android:

```
Zebra_RFIDAPI3_SDK_2.0.5.297/rfidapi3lib-2.0.5.297.aar
    →  frontend/android/app/libs/rfidapi3lib-2.0.5.297.aar
```

---

## Passo 3 — Atualizar build.gradle

Abra `frontend/android/app/build.gradle` e adicione na seção `dependencies`:

```gradle
dependencies {
    // ... linhas existentes ...
    implementation fileTree(dir: 'libs', include: ['*.aar', '*.jar'])
}
```

---

## Passo 4 — Copiar os arquivos Java do plugin

Crie o diretório e copie os dois arquivos desta pasta:

```
ZebraRfidPlugin.java  →  frontend/android/app/src/main/java/com/rphub/app/ZebraRfidPlugin.java
ZebraRfidHandler.java →  frontend/android/app/src/main/java/com/rphub/app/ZebraRfidHandler.java
```

O diretório `com/rphub/app/` já existe (criado pelo Capacitor).

---

## Passo 5 — Registrar o plugin no MainActivity

Abra `frontend/android/app/src/main/java/com/rphub/app/MainActivity.java` e adicione:

```java
import com.rphub.app.ZebraRfidPlugin;   // adicione este import

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZebraRfidPlugin.class);   // adicione esta linha
        super.onCreate(savedInstanceState);
    }
}
```

---

## Passo 6 — Configurar a URL da API

Crie `frontend/.env.production`:

```
VITE_API_BASE_URL=https://SEU-APP.onrender.com
```

(substitua pelo endereço real do servidor Django)

---

## Passo 7 — Compilar e instalar

```bash
cd frontend

# Gera o build do React
npm run build

# Copia o build para o projeto Android
npx cap sync

# Abre o Android Studio
npx cap open android
```

No Android Studio:
1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Clique em "locate" para achar o APK
3. Instale no celular via cabo USB ou ADB:
   ```bash
   adb install app-debug.apk
   ```

---

## Passo 8 — Parear o RFD8500

No celular Android:
1. Ligue o RFD8500 (botão lateral)
2. Configurações → Bluetooth → procurar "RFD8500..."
3. Parear o dispositivo
4. Abra o app RPHub → aba Enxoval → Cadastro → **Conectar leitor**

O app vai encontrar automaticamente o primeiro leitor Bluetooth pareado.

---

## Permissões necessárias (já declaradas no plugin)

- BLUETOOTH / BLUETOOTH_ADMIN / BLUETOOTH_CONNECT / BLUETOOTH_SCAN
- ACCESS_FINE_LOCATION (obrigatório para Bluetooth no Android 10+)

O app vai pedir as permissões na primeira conexão.

---

## Teste rápido com as etiquetas

1. Crie um tipo em **Cadastro** (ex: "Teste" com código `0001`)
2. Conecte o leitor
3. Clique **Iniciar leitura** e aproxime uma etiqueta
4. O EPC vai aparecer na lista
5. Clique **Cadastrar X etiquetas**

As etiquetas de fábrica (sem prefixo A100) vão aparecer como "Tipo desconhecido"
— isso é esperado. Elas precisam ser regravadas com o EPC do sistema (ex: `A100 0001 00000001 00000000`).
Para gravar, use a função Gravar EPC disponível via `rfid.gravarEpc()`.
