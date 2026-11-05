package com.aftersignal.policytest;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import android.security.NetworkSecurityPolicy;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class PolicyProbe extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Bundle results = new Bundle();
        try {
            NetworkSecurityPolicy policy = NetworkSecurityPolicy.getInstance();
            String[] hosts = {"localhost", "127.0.0.1", "::1", "[::1]", "192.168.1.1", "example.com", "evil.localhost"};
            for (String host : hosts) results.putString("policy-" + host, Boolean.toString(policy.isCleartextTrafficPermitted(host)));
            ServerSocket server = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
            server.setSoTimeout(12000);
            Thread thread = new Thread(() -> {
                try {
                    for (int i=0;i<2;i++) {
                        Socket socket=server.accept();
                        OutputStream out=socket.getOutputStream();
                        out.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK".getBytes(StandardCharsets.US_ASCII));
                        out.flush();socket.close();
                    }
                } catch (Exception e) { Log.e("OkiPolicyProbe", "server", e); }
                finally { try { server.close(); } catch (Exception ignored) {} }
            });
            thread.start();
            for (String host : new String[]{"localhost", "127.0.0.1"}) {
                try {
                    HttpURLConnection connection=(HttpURLConnection)new URL("http://"+host+":"+server.getLocalPort()+"/").openConnection();
                    connection.setConnectTimeout(10000);connection.setReadTimeout(10000);
                    results.putString("http-"+host, Integer.toString(connection.getResponseCode()));
                    connection.disconnect();
                } catch (Exception e) { results.putString("http-"+host, e.toString()); }
            }
            thread.join(15000);
            finish(Activity.RESULT_OK, results);
        } catch (Throwable failure) {
            Log.e("OkiPolicyProbe", "Policy probe failed", failure);
            results.putString("error", failure.toString());
            finish(Activity.RESULT_CANCELED, results);
        }
    }
}
