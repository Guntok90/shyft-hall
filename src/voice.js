// Off until the public site has a voice relay. The local server still
// has the route; flipping this back on restores click, T, and Talk.
export const VOICE_ENABLED = false;

const coarse = window.matchMedia("(pointer: coarse)").matches;
const IDLE = coarse ? "Tap Talk" : "Press T to talk";
const CLICK_LINE = "You clicked me. Brave. The logo has been spinning for attention all day, and you picked the one without a face.";
const PASSING = new Set([IDLE, "Listening", "Connecting…"]);

export function createTalk({ line, button, live }) {
  let near = false;
  let stay = false;
  let generation = 0;
  let peer = null;
  let channel = null;
  let microphone = null;
  let audio = null;
  let spoken = "";

  function show(text) {
    line.hidden = !text;
    line.textContent = text;
    if (live && near) live.textContent = text || "Talk to me about the work.";
  }

  function cleanup() {
    microphone?.getTracks().forEach((track) => track.stop());
    microphone = null;
    channel?.close();
    channel = null;
    peer?.close();
    peer = null;
    if (audio) audio.srcObject = null;
    document.body.classList.remove("talking");
    if (button) button.textContent = "Talk";
  }

  function stop() {
    generation += 1;
    stay = false;
    cleanup();
    show(near ? IDLE : "");
  }

  function onEvent(event) {
    if (event.type === "error") {
      show("The voice line failed.");
      return;
    }
    const delta =
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.audio_transcript.delta"
        ? event.delta
        : "";
    if (delta) {
      spoken += delta;
      show(spoken);
      return;
    }
    if (
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.audio_transcript.done"
    ) {
      show(event.transcript || spoken);
      spoken = "";
    }
  }

  async function start(opening) {
    const gen = ++generation;
    cleanup();
    generation = gen;
    show("Connecting…");
    if (button) button.textContent = "Stop";
    try {
      const connection = new RTCPeerConnection();
      peer = connection;
      audio = audio || new Audio();
      audio.autoplay = true;
      connection.addEventListener("track", (event) => {
        audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        audio.play().catch(() => {});
        document.body.classList.add("talking");
      });
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (gen !== generation) return cleanup();
      for (const track of microphone.getAudioTracks()) connection.addTrack(track, microphone);

      channel = connection.createDataChannel("oai-events");
      channel.addEventListener("open", () => {
        if (gen !== generation) return;
        show("Listening");
        const instructions = opening
          ? `Say exactly this, in a dry amused tone, and then stop. Do not add words before or after it: "${opening}"`
          : "Greet the visitor in one short sentence and invite them to ask about the work.";
        channel.send(JSON.stringify({
          type: "response.create",
          response: { instructions },
        }));
      });
      channel.addEventListener("message", (event) => {
        if (gen !== generation) return;
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          show("The voice line failed.");
        }
      });

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (connection.iceGatheringState !== "complete") {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 4000);
          const done = () => {
            if (connection.iceGatheringState !== "complete") return;
            clearTimeout(timer);
            connection.removeEventListener("icegatheringstatechange", done);
            resolve();
          };
          connection.addEventListener("icegatheringstatechange", done);
        });
      }
      if (gen !== generation) return cleanup();
      const sdp = connection.localDescription?.sdp || "";
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: sdp,
      });
      if (!response.ok) throw new Error("session");
      const answer = await response.text();
      if (gen !== generation) return cleanup();
      await connection.setRemoteDescription({ type: "answer", sdp: answer });
      document.body.classList.add("talking");
      show("Listening");
    } catch (error) {
      if (gen !== generation) return;
      cleanup();
      const denied = error && (error.name === "NotAllowedError" || error.name === "NotFoundError");
      show(denied ? "The microphone is blocked." : "The voice line failed.");
    }
  }

  function toggle(detail) {
    if (peer || microphone) {
      stop();
      return;
    }
    stay = Boolean(detail && detail.stay);
    start(detail && detail.clicked ? CLICK_LINE : "");
  }

  function follow(isNear) {
    near = isNear;
    if (isNear) stay = false;
    const live = Boolean(peer || microphone);
    if (!isNear && !stay) {
      if (button) button.hidden = true;
      if (live) stop();
      else if (!line.textContent || PASSING.has(line.textContent)) show("");
      return;
    }
    if (button) {
      const showButton = isNear || live;
      button.hidden = !showButton;
      if (showButton) {
        const label = live ? "Stop" : "Talk";
        if (button.textContent !== label) button.textContent = label;
      }
    }
    if (isNear && !live && (line.hidden || !line.textContent)) show(IDLE);
  }

  button?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });

  return { toggle, follow, stop };
}
