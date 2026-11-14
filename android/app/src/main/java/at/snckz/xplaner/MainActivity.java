package at.snckz.xplaner;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * X-Planer als Android-App: zeigt die Web-App von GitHub Pages in einer WebView.
 * Vorteile: neue Daten (täglich) und App-Updates kommen automatisch, offline läuft sie über den Service Worker.
 * Dazu kommen die Dinge, die eine reine WebView nicht kann: Kamera, Foto aufnehmen, Dateien teilen, Zurück-Taste.
 */
public class MainActivity extends Activity {
    static final String START_URL = "https://snckz.github.io/beyblade-x-planer/";
    static final String HOST = "snckz.github.io";
    private static final int REQ_FILE = 1;
    private static final int REQ_CAMERA_PERMISSION = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri photoUri;
    private PermissionRequest pendingPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#08090E"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " XPlanerAndroid/1");
        web.addJavascriptInterface(new Bridge(), "XPlanerAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Alles außerhalb der App (Wiki, Amazon, Kalender-Links …) im Browser bzw. passender App öffnen
                if (HOST.equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/beyblade-x-planer")) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Nur wenn die Startseite selbst fehlt (erster Start ohne Internet) einen Hinweis zeigen
                if (request.isForMainFrame()) {
                    view.loadDataWithBaseURL(null,
                        "<html><body style='background:#08090E;color:#fff;font-family:sans-serif;padding:32px;text-align:center'>"
                            + "<h2>Keine Verbindung</h2><p>Beim ersten Start braucht X-Planer einmal Internet. Danach läuft die App auch offline.</p>"
                            + "<p><a style='color:#FF3B30' href='" + START_URL + "'>Nochmal versuchen</a></p></body></html>",
                        "text/html", "utf-8", null);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Live-Kamera für den Barcode-Scan
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.getResources());
                    } else {
                        pendingPermission = request;
                        requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_CAMERA_PERMISSION);
                    }
                });
            }

            // <input type="file" capture>: Foto aufnehmen oder aus der Galerie wählen (Kauf-Check, Import)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = params.createIntent();
                List<Intent> extra = new ArrayList<>();
                boolean image = false;
                for (String t : params.getAcceptTypes()) if (t != null && t.startsWith("image")) image = true;
                if (image) {
                    try {
                        File dir = new File(getCacheDir(), "photos");
                        dir.mkdirs();
                        File f = File.createTempFile("foto", ".jpg", dir);
                        photoUri = FileProvider.getUriForFile(MainActivity.this, "at.snckz.xplaner.files", f);
                        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        cam.putExtra(MediaStore.EXTRA_OUTPUT, photoUri);
                        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        if (params.isCaptureEnabled()) {
                            startActivityForResult(cam, REQ_FILE);
                            return true;
                        }
                        extra.add(cam);
                    } catch (Exception e) {
                        photoUri = null;
                    }
                }
                Intent chooser = Intent.createChooser(pick, image ? "Foto wählen" : "Datei wählen");
                if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
                try {
                    startActivityForResult(chooser, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(startUrl(getIntent()));
    }

    private String startUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        return data != null && HOST.equals(data.getHost()) ? data.toString() : START_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) web.loadUrl(startUrl(intent));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && (data.getData() != null || data.getClipData() != null)) {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            } else if (photoUri != null) {
                result = new Uri[] { photoUri }; // Foto von der Kamera
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        photoUri = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_CAMERA_PERMISSION && pendingPermission != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) pendingPermission.grant(pendingPermission.getResources());
            else pendingPermission.deny();
            pendingPermission = null;
        }
    }

    // Zurück-Taste: erst offene Fenster in der App schließen (Escape), dann zurück, dann App verlassen
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
            "(function(){var d=document.querySelectorAll('[aria-modal=\"true\"]');if(d.length){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return 'closed'}return 'none'})()",
            value -> {
                if (value != null && value.contains("closed")) return;
                if (web.canGoBack()) web.goBack();
                else finish();
            });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("Keine App zum Öffnen gefunden");
        }
    }

    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    /** Wird aus der Web-App aufgerufen (window.XPlanerAndroid), weil eine WebView keine Downloads/Teilen kann. */
    private class Bridge {
        /** Datei speichern und teilen bzw. öffnen: Kalender (.ics) → Kalender-App, sonst Teilen-Menü (Fotos, Drive, WhatsApp …). */
        @JavascriptInterface
        public void saveFile(String base64, String mime, String fileName) {
            try {
                File dir = new File(getCacheDir(), "shared");
                dir.mkdirs();
                String safe = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
                File f = new File(dir, safe);
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, "at.snckz.xplaner.files", f);
                Intent intent;
                if ("text/calendar".equals(mime)) {
                    intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, mime);
                } else {
                    intent = new Intent(Intent.ACTION_SEND);
                    intent.setType(mime);
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                }
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(intent, "text/calendar".equals(mime) ? "Im Kalender öffnen" : "Speichern oder teilen");
                runOnUiThread(() -> {
                    try {
                        startActivity(chooser);
                    } catch (ActivityNotFoundException e) {
                        toast("Keine passende App gefunden");
                    }
                });
            } catch (Exception e) {
                toast("Datei konnte nicht gespeichert werden");
            }
        }

        @JavascriptInterface
        public int version() {
            return 1;
        }
    }
}
