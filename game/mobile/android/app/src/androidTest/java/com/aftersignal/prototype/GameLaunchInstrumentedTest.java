package com.aftersignal.prototype;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.Assume;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Device smoke test of the actual packaged WebView; writes a test checkpoint. */
@RunWith(AndroidJUnit4.class)
public class GameLaunchInstrumentedTest {
    private static final long PAGE_TIMEOUT_MS = 45000;
    private static final long SCRIPT_TIMEOUT_MS = 5000;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView match = findWebView(group.getChildAt(i));
                if (match != null) return match;
            }
        }
        return null;
    }

    private WebView waitForWebView(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + PAGE_TIMEOUT_MS;
        do {
            AtomicReference<WebView> found = new AtomicReference<>();
            scenario.onActivity(activity -> found.set(findWebView(activity.getWindow().getDecorView())));
            if (found.get() != null) return found.get();
            Thread.sleep(150);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Activity did not create a WebView");
    }

    private JSONObject evaluate(WebView web, String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(expression, result -> {
            value.set(result);
            done.countDown();
        }));
        assertTrue("WebView JavaScript callback timed out", done.await(SCRIPT_TIMEOUT_MS, TimeUnit.MILLISECONDS));
        assertNotNull("WebView returned no JSON", value.get());
        if ("null".equals(value.get())) return new JSONObject();
        return new JSONObject(value.get());
    }

    private JSONObject snapshot(WebView web) throws Exception {
        return evaluate(web, "(() => { const a=document.getElementById('app'),o=document.getElementById('consent-opening'),p=document.getElementById('play'),s=document.getElementById('speaker'),t=document.getElementById('story-text'),i=document.getElementById('portrait'),r=i?.getBoundingClientRect(),c=i?getComputedStyle(i):null; return {ready:document.readyState,url:location.href,title:document.title,opening:!!o&&!o.hidden,app:!!a&&!a.hidden,playing:!!p&&!p.hidden,speaker:s?.textContent||'',text:t?.textContent||'',portrait:!!i&&!i.hidden&&i.complete&&i.naturalWidth>0&&!!r&&r.width>0&&r.height>0&&c.display!=='none'&&c.visibility==='visible'&&Number(c.opacity)>0,choices:Array.from(document.querySelectorAll('#interaction button')).filter(b=>!b.hidden).map(b=>b.textContent.trim())}; })()");
    }

    private JSONObject waitFor(WebView web, String description, Check check) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + PAGE_TIMEOUT_MS;
        JSONObject state = null;
        do {
            state = snapshot(web);
            if (check.matches(state)) return state;
            Thread.sleep(150);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Timed out waiting for " + description + "; last state: " + state);
    }

    private interface Check { boolean matches(JSONObject state); }

    /** Send a real Android touch to a CSS viewport coordinate in the WebView. */
    private void tap(WebView web, double cssX, double cssY, double viewportWidth, double viewportHeight) {
        final int[] location = new int[2];
        final int[] dimensions = new int[2];
        instrumentation.runOnMainSync(() -> {
            web.getLocationOnScreen(location);
            dimensions[0] = web.getWidth();
            dimensions[1] = web.getHeight();
        });
        assertTrue("Invalid WebView viewport", viewportWidth > 0 && viewportHeight > 0 && dimensions[0] > 0 && dimensions[1] > 0);
        float x = location[0] + (float) (cssX * dimensions[0] / viewportWidth);
        float y = location[1] + (float) (cssY * dimensions[1] / viewportHeight);
        long down = SystemClock.uptimeMillis();
        MotionEvent press = MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent release = MotionEvent.obtain(down, down + 50, MotionEvent.ACTION_UP, x, y, 0);
        try {
            instrumentation.sendPointerSync(press);
            instrumentation.sendPointerSync(release);
        } finally {
            press.recycle();
            release.recycle();
        }
    }

    private void tapAdvance(WebView web) throws Exception {
        JSONObject rect = evaluate(web, "(() => {const e=document.getElementById('advance');if(!e||e.hidden)return {available:false};e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {available:true,x:r.left+r.width/2,y:r.top+r.height/2,vw:innerWidth,vh:innerHeight};})()");
        assertTrue("Continue is unavailable", rect.optBoolean("available"));
        assertTrue("Continue is outside the viewport", rect.getDouble("x") >= 0 && rect.getDouble("x") < rect.getDouble("vw") && rect.getDouble("y") >= 0 && rect.getDouble("y") < rect.getDouble("vh"));
        tap(web, rect.getDouble("x"), rect.getDouble("y"), rect.getDouble("vw"), rect.getDouble("vh"));
    }

    private void tapChoice(WebView web, String label) throws Exception {
        // Find the rendered choice, then send a real Android touch to it.
        String quoted = JSONObject.quote(label);
        JSONObject rect = evaluate(web, "(() => {const e=Array.from(document.querySelectorAll('#interaction button')).find(b=>!b.hidden&&b.textContent.trim()===" + quoted + ");if(!e)return {available:false};e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {available:r.width>0&&r.height>0,x:r.left+r.width/2,y:r.top+r.height/2,vw:innerWidth,vh:innerHeight};})()");
        assertTrue("Choice is unavailable: " + label, rect.optBoolean("available"));
        assertTrue("Choice is outside the viewport", rect.getDouble("x") >= 0 && rect.getDouble("x") < rect.getDouble("vw") && rect.getDouble("y") >= 0 && rect.getDouble("y") < rect.getDouble("vh"));
        tap(web, rect.getDouble("x"), rect.getDouble("y"), rect.getDouble("vw"), rect.getDouble("vh"));
    }

    private void tapControl(WebView web, String id) throws Exception {
        JSONObject rect = evaluate(web, "(() => {const e=document.getElementById(" + JSONObject.quote(id) + ");if(!e||e.hidden||e.disabled)return {available:false};e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {available:r.width>0&&r.height>0,x:r.left+r.width/2,y:r.top+r.height/2,vw:innerWidth,vh:innerHeight};})()");
        assertTrue("Control is unavailable: " + id, rect.optBoolean("available"));
        assertTrue("Control is outside the viewport: " + id, rect.getDouble("x") >= 0 && rect.getDouble("x") < rect.getDouble("vw") && rect.getDouble("y") >= 0 && rect.getDouble("y") < rect.getDouble("vh"));
        tap(web, rect.getDouble("x"), rect.getDouble("y"), rect.getDouble("vw"), rect.getDouble("vh"));
    }

    private JSONObject waitForElement(WebView web, String id) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + PAGE_TIMEOUT_MS;
        JSONObject state;
        do {
            state = evaluate(web, "(() => {const e=document.getElementById(" + JSONObject.quote(id) + ");return {visible:!!e&&!e.hidden,text:e?.textContent||''};})()");
            if (state.optBoolean("visible")) return state;
            Thread.sleep(150);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Timed out waiting for " + id + "; last state: " + state);
    }

    @Test
    public void opensStoryAndShowsCharacterAfterRealTouches() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView web = waitForWebView(scenario);
            JSONObject initial = waitFor(web, "the opening", state -> "complete".equals(state.optString("ready")) && state.optBoolean("opening"));
            assertTrue("Unexpected game URL: " + initial.optString("url"), initial.optString("url").startsWith("https://localhost/"));
            assertTrue("Unexpected title", initial.optString("title").startsWith("Oki Doki"));
            // Touch visible opening copy instead of its Agree button. A raw
            // (8,8) viewport touch can land beneath Android's status bar on an
            // edge-to-edge WebView and never reach the page.
            JSONObject openingText = evaluate(web, "(() => {const e=document.querySelector('#consent-copy p');if(!e)return {available:false};e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {available:r.width>0&&r.height>0,x:r.left+r.width/2,y:r.top+r.height/2,vw:innerWidth,vh:innerHeight};})()");
            assertTrue("Opening text is unavailable", openingText.optBoolean("available"));
            assertTrue("Opening text is outside the viewport", openingText.getDouble("x") >= 0 && openingText.getDouble("x") < openingText.getDouble("vw") && openingText.getDouble("y") >= 0 && openingText.getDouble("y") < openingText.getDouble("vh"));
            tap(web, openingText.getDouble("x"), openingText.getDouble("y"), openingText.getDouble("vw"), openingText.getDouble("vh"));
            JSONObject first = waitFor(web, "the first story passage", state -> state.optBoolean("app") && state.optBoolean("playing") && "NARRATOR".equalsIgnoreCase(state.optString("speaker").trim()));
            assertTrue("First passage is empty", !first.optString("text").trim().isEmpty());
            tapAdvance(web);
            waitFor(web, "the Service passage", state -> "SERVICE".equalsIgnoreCase(state.optString("speaker").trim()));
            tapAdvance(web);
            waitFor(web, "Niko and the portrait image", state -> "NIKO".equalsIgnoreCase(state.optString("speaker").trim()) && state.optBoolean("portrait"));

            // Check every intermediate passage so a missed or premature touch
            // cannot accidentally satisfy the final choice assertion.
            String[] passages = {
                "It was mine. I’m Mira.",
                "I’m Ash.",
                "Pink fabric drapes between the beams",
                "Tonight is the Last Ticket.",
                "The prize is a giant moth I made.",
                "The cream-coloured plush moth peers down",
                "Before the hunt starts, what brought you out"
            };
            for (String passage : passages) {
                tapAdvance(web);
                waitFor(web, passage, state -> state.optString("text").contains(passage));
            }
            String choice = "I didn’t want anyone to spend the night alone.";
            JSONObject choiceState = waitFor(web, "the first choice", state -> state.optJSONArray("choices") != null && state.optJSONArray("choices").length() == 3);
            assertTrue("The expected answer is missing", choiceState.optJSONArray("choices").toString().contains(choice));
            tapChoice(web, choice);
            JSONObject savedPassage = waitFor(web, "the answer to the selected choice", state -> "ASH".equalsIgnoreCase(state.optString("speaker").trim()) && state.optString("text").startsWith("That’s why I came too."));

            // Do not overwrite an existing valid or invalid player checkpoint.
            // This test is intended for a disposable device or emulator.
            String key = "okie-dokie.arcade.v1";
            String quotedKey = JSONObject.quote(key);
            JSONObject before = evaluate(web, "(() => ({empty:localStorage.getItem(" + quotedKey + ")===null}))()");
            Assume.assumeTrue("A checkpoint exists; run on a disposable device with no saved story", before.optBoolean("empty"));
            String ownCheckpoint = null;
            try {
                tapControl(web, "save");
                JSONObject recorded = evaluate(web, "(() => ({value:localStorage.getItem(" + quotedKey + ")}))()");
                ownCheckpoint = recorded.optString("value", "");
                assertTrue("No checkpoint was written", !ownCheckpoint.isEmpty());
                JSONObject saved = waitForElement(web, "resume-game");
                assertTrue("Resume was not offered after saving", saved.optBoolean("visible"));

                // Recreate the native Activity to exercise durable WebView
                // storage rather than merely resuming in page memory.
                scenario.recreate();
                web = waitForWebView(scenario);
                waitFor(web, "opening after activity recreation", state -> "complete".equals(state.optString("ready")) && state.optBoolean("opening"));
                tapControl(web, "consent-agree");
                waitFor(web, "the story after recreation", state -> state.optBoolean("app") && state.optBoolean("playing"));
                waitForElement(web, "resume-game");
                tapControl(web, "resume-game");
                waitForElement(web, "resume-confirm");
                tapControl(web, "resume-confirm");
                waitFor(web, "the saved passage after recreation", state -> state.optString("speaker").equals(savedPassage.optString("speaker")) && state.optString("text").equals(savedPassage.optString("text")));
            } finally {
                if (ownCheckpoint != null) {
                    // Only remove exactly the value created above; never clear
                    // unrelated storage or a checkpoint changed meanwhile.
                    WebView cleanupWeb = waitForWebView(scenario);
                    String quotedCheckpoint = JSONObject.quote(ownCheckpoint);
                    evaluate(cleanupWeb, "(() => {const k=" + quotedKey + ";if(localStorage.getItem(k)===" + quotedCheckpoint + ")localStorage.removeItem(k);return {done:true};})()");
                }
            }
        }
    }
    /** A seeded visual checkpoint is safe only on a disposable device. */
    @Test
    public void signalPicturesRespondToRealTouch() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView web = waitForWebView(scenario);
            waitFor(web, "the opening", state -> "complete".equals(state.optString("ready")) && state.optBoolean("opening"));
            final String key = JSONObject.quote("okie-dokie.arcade.v1");
            JSONObject before = evaluate(web, "(() => ({empty:localStorage.getItem(" + key + ")===null}))()");
            Assume.assumeTrue("A checkpoint exists; run on a disposable device with no saved story", before.optBoolean("empty"));
            String ownCheckpoint = null;
            try {
                for (String signal : new String[]{"star", "bell", "ribbon"}) {
                    JSONObject seed = new JSONObject();
                    seed.put("version", 1);
                    seed.put("node", "regroup_signal_choice");
                    seed.put("answer", "");
                    seed.put("privateAnswer", "");
                    seed.put("relationship", "Niko");
                    seed.put("flags", new JSONObject().put("companion", "Niko").put("keepsake", signal).put("regroup_signal_seen", signal));
                    seed.put("followupMemory", new org.json.JSONArray());
                    String prior = ownCheckpoint;
                    ownCheckpoint = seed.toString();
                    String expectedPrior = prior == null ? "null" : JSONObject.quote(prior);
                    JSONObject written = evaluate(web, "(() => {const k=" + key + ";if(localStorage.getItem(k)!==" + expectedPrior + ")return {stored:false};localStorage.setItem(k," + JSONObject.quote(ownCheckpoint) + ");window.__signalTestBeforeReload=true;return {stored:true};})()");
                    assertTrue("Checkpoint changed during the test", written.optBoolean("stored"));
                    WebView reloadWeb = web;
                    instrumentation.runOnMainSync(reloadWeb::reload);
                    long deadline = SystemClock.elapsedRealtime() + PAGE_TIMEOUT_MS;
                    JSONObject fresh;
                    do {
                        fresh = evaluate(web, "(() => ({ready:document.readyState, fresh:window.__signalTestBeforeReload!==true, opening:!!document.getElementById('consent-opening')&&!document.getElementById('consent-opening').hidden}))()");
                        if (fresh.optBoolean("fresh") && fresh.optBoolean("opening") && "complete".equals(fresh.optString("ready"))) break;
                        Thread.sleep(150);
                    } while (SystemClock.elapsedRealtime() < deadline);
                    assertTrue("Reload did not return to the opening: " + fresh, fresh.optBoolean("fresh") && fresh.optBoolean("opening") && "complete".equals(fresh.optString("ready")));
                    tapControl(web, "consent-agree");
                    waitFor(web, "the story after opening", state -> state.optBoolean("app") && state.optBoolean("playing"));
                    waitForElement(web, "resume-game");
                    tapControl(web, "resume-game");
                    waitForElement(web, "resume-confirm");
                    tapControl(web, "resume-confirm");
                    waitFor(web, signal + " choice", state -> state.optString("text").contains("little " + signal + " is still there"));
                    JSONObject picture = evaluate(web, "(() => {const e=document.querySelector('button.ticket-light-touch'),i=e?.querySelector('img.ticket-signal');if(!e||!i)return {available:false};e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {available:r.width>=44&&r.height>=44&&i.complete&&i.naturalWidth>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0,src:i.getAttribute('src'),x:r.left+r.width/2,y:r.top+r.height/2,vw:innerWidth,vh:innerHeight};})()");
                    assertTrue("Picture unavailable for " + signal + ": " + picture, picture.optBoolean("available") && picture.optString("src").endsWith("screen-signal-" + signal + ".svg"));
                    assertTrue("Picture outside viewport: " + picture, picture.getDouble("x") >= 0 && picture.getDouble("x") < picture.getDouble("vw") && picture.getDouble("y") >= 0 && picture.getDouble("y") < picture.getDouble("vh"));
                    tap(web, picture.getDouble("x"), picture.getDouble("y"), picture.getDouble("vw"), picture.getDouble("vh"));
                    waitFor(web, "the touch response", state -> state.optString("text").contains("Your fingerprint stays on the glass"));
                    JSONObject print = evaluate(web, "(() => {const e=document.querySelector('.ticket-fingerprint');if(!e)return {visible:false};const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0};})()");
                    assertTrue("Fingerprint missing after touching " + signal, print.optBoolean("visible"));
                }
            } finally {
                if (ownCheckpoint != null) {
                    WebView cleanupWeb = waitForWebView(scenario);
                    evaluate(cleanupWeb, "(() => {const k=" + key + ";if(localStorage.getItem(k)===" + JSONObject.quote(ownCheckpoint) + ")localStorage.removeItem(k);return {done:true};})()");
                }
            }
        }
    }
}
