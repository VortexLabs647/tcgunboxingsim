package com.vortalyx.tcgunboxingsim;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.http.SslError;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.util.Collections;

public class MainActivity extends Activity {
 private WebView web;
 private FrameLayout root;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private volatile boolean bundled=false;
 private boolean ready=false;
 private static final String HOME="https://tcgunboxingsim.com/";
 private final Runnable startupTimeout=()->useBundle();
 private boolean ownHost(Uri uri){return "https".equals(uri.getScheme())&&("tcgunboxingsim.com".equals(uri.getHost())||"www.tcgunboxingsim.com".equals(uri.getHost()));}
 private boolean inside(Uri uri){String path=uri.getPath();return ownHost(uri)&&path!=null&&!path.endsWith(".apk");}
 private void external(Uri uri){if(!"https".equals(uri.getScheme())&&!"mailto".equals(uri.getScheme()))return;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){Toast.makeText(this,"Open this link in your browser.",Toast.LENGTH_SHORT).show();}}
 @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(12,9,21));root.setFitsSystemWindows(true);setContentView(root);
 if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{Insets bars=insets.getInsets(WindowInsets.Type.systemBars());Insets keyboard=insets.getInsets(WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));return insets;});
 web=new WebView(this);web.setBackgroundColor(Color.rgb(12,9,21));root.addView(web,new FrameLayout.LayoutParams(-1,-1));if(Build.VERSION.SDK_INT>=29){root.setForceDarkAllowed(false);web.setForceDarkAllowed(false);}WebSettings s=web.getSettings();if(Build.VERSION.SDK_INT>=33)s.setAlgorithmicDarkeningAllowed(false);else if(Build.VERSION.SDK_INT>=29)s.setForceDark(WebSettings.FORCE_DARK_OFF);s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);s.setSupportMultipleWindows(false);s.setBuiltInZoomControls(false);s.setMediaPlaybackRequiresUserGesture(true);s.setUserAgentString(s.getUserAgentString()+" TCGAndroid/1.2");CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
 web.setWebChromeClient(new WebChromeClient());
 web.setWebViewClient(new WebViewClient(){
  @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!request.isForMainFrame())return false;Uri uri=request.getUrl();if(inside(uri))return false;external(uri);return true;}
  @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return bundled&&ownHost(request.getUrl())?assetResponse(request.getUrl()):null;}
  @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError e){if(request.isForMainFrame())useBundle();}
  @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)useBundle();}
  @Override public void onReceivedSslError(WebView view,SslErrorHandler sslHandler,SslError error){sslHandler.cancel();if(ownHost(Uri.parse(error.getUrl())))useBundle();}
  @Override public void onPageFinished(WebView view,String url){CookieManager.getInstance().flush();if(ownHost(Uri.parse(url)))web.evaluateJavascript("Boolean(window.TCGEngine && document.querySelector('.pack-choice,.account-card,.item-card,.rank-membership'))",result->{if("true".equals(result)){ready=true;handler.removeCallbacks(startupTimeout);}});}
 });
 web.setDownloadListener((url,userAgent,disposition,mime,length)->external(Uri.parse(url)));bundled=saved!=null&&saved.getBoolean("bundled",false);if(saved==null||web.restoreState(saved)==null)web.loadUrl(HOME);handler.postDelayed(startupTimeout,10000);
 }
 private void useBundle(){handler.post(()->{if(bundled||ready||isFinishing())return;bundled=true;handler.removeCallbacks(startupTimeout);web.stopLoading();web.loadUrl(HOME);});}
 private WebResourceResponse assetResponse(Uri uri){try{String path=uri.getPath();if(path==null||path.equals("/"))path="/index.html";if(path.contains("..")||path.indexOf('\\')>=0||path.endsWith(".apk"))return missing();String file=path.substring(1);InputStream input=getAssets().open("game/"+file);String mime=file.endsWith(".html")?"text/html":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".json")||file.endsWith(".webmanifest")?"application/json":file.endsWith(".webp")?"image/webp":file.endsWith(".png")?"image/png":file.endsWith(".svg")?"image/svg+xml":file.endsWith(".ttf")?"font/ttf":"application/octet-stream";return new WebResourceResponse(mime,"UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-store"),input);}catch(IOException e){return missing();}}
 private WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 @Override public void onBackPressed(){web.evaluateJavascript("Boolean(window.tcgGoBack && window.tcgGoBack())",result->{if(!"true".equals(result))finish();});}
 @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putBoolean("bundled",bundled);web.saveState(out);}
 @Override protected void onPause(){super.onPause();web.onPause();CookieManager.getInstance().flush();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(web!=null){root.removeView(web);web.destroy();}super.onDestroy();}
}
