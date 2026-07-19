<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Nuestro Espacio Privado</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <style>
        body {
            margin: 0; background: #121212; color: white; font-family: system-ui, sans-serif;
            display: flex; flex-direction: column; height: 100vh; overflow: hidden;
        }
        .setup-screen {
            display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 20px;
        }
        .call-screen { display: none; flex-direction: column; height: 100vh; position: relative; }
        video { width: 100%; height: 50%; object-fit: cover; background: #1e1e1e; }
        #remoteVideo { height: 65%; }
        #localVideo { height: 35%; border-top: 2px solid #333; }
        .controls {
            padding: 20px; display: flex; justify-content: center; gap: 10px;
            background: #1a1a1a; position: absolute; bottom: 0; width: 100%; box-sizing: border-box;
        }
        button {
            padding: 15px 30px; border: none; border-radius: 25px; font-weight: bold; font-size: 16px; cursor: pointer;
        }
        .btn-user { background: #333; color: white; border: 1px solid #555; }
        .btn-call { background: #2ed573; color: white; width: 100%; }
    </style>
</head>
<body>

    <!-- 1. Pantalla de Selección de Usuario -->
    <div id="setupScreen" class="setup-screen">
        <h2>¿Quién eres?</h2>
        <button class="btn-user" onclick="iniciarApp('daniel')">Soy Daniel (PC/Android)</button>
        <button class="btn-user" onclick="iniciarApp('gisel')">Soy Gisel (iPhone)</button>
    </div>

    <!-- 2. Pantalla de la Llamada -->
    <div id="callScreen" class="call-screen">
        <video id="remoteVideo" autoplay playsinline></video>
        <video id="localVideo" autoplay playsinline muted></video>
        <div class="controls">
            <button class="btn-call" id="btnAccion">Iniciar Cámara y Llamar</button>
        </div>
    </div>

    <script>
        const SERVIDOR_URL = "https://servidor-llamadas-zg5q.onrender.com"; 
        
        let socket;
        let peerConnection;
        let localStream;
        let miUsuario = "";
        let miDestinatario = "";

        const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

        function iniciarApp(usuario) {
            miUsuario = usuario;
            miDestinatario = (usuario === 'daniel') ? 'gisel' : 'daniel';

            document.getElementById('setupScreen').style.display = 'none';
            document.getElementById('callScreen').style.display = 'flex';
            document.getElementById('btnAccion').innerText = `Llamar a ${miDestinatario.toUpperCase()}`;

            console.log(`[PASO 1] Iniciando app como: ${miUsuario}. Destinatario configurado: ${miDestinatario}`);
            alert(`Registrándote como ${miUsuario.toUpperCase()}. Conectando al servidor...`);

            // Conectar al servidor de señalización con tiempos de espera forzados
            socket = io(SERVIDOR_URL, {
                timeout: 10000,
                transports: ['websocket', 'polling']
            });
            
            socket.on('connect', () => {
                console.log("[PASO 2] ¡Conexión WebSocket establecida con éxito con Render!");
                alert("¡Conectado al servidor de Render correctamente! Ya puedes llamar cuando el otro usuario esté listo.");
                socket.emit('register', miUsuario);
            });

            socket.on('connect_error', (error) => {
                console.error("[ERROR] No se pudo conectar al servidor de Render:", error);
                alert("ERROR DE CONEXIÓN: El servidor de Render está dormido o apagado. Abre la URL del servidor en otra pestaña, espera a que cargue e intenta refrescar esta página.");
            });

            configurarSenales();
        }

        // Función directa para asegurar la compatibilidad con los permisos rígidos de iOS/Safari
        function solicitarMedios(restricciones, callback Éxito) {
            console.log("[PASO 3] Solicitando permisos de hardware al navegador con opciones:", restricciones);
            
            navigator.mediaDevices.getUserMedia(restricciones)
                .then(stream => {
                    console.log("[PASO 4] Permisos concedidos. Stream de vídeo/audio capturado.");
                    localStream = stream;
                    document.getElementById('localVideo').srcObject = stream;
                    callbackÉxito();
                })
                .catch(error => {
                    console.warn("[ADVERTENCIA] Error al pedir cámara/micro completo:", error.name);
                    
                    // Si falla el combo completo y tiene activado el vídeo, intentamos degradar a SOLO AUDIO automáticamente
                    if (restricciones.video) {
                        console.log("Intentando arrancar en modo de emergencia: SOLO AUDIO...");
                        solicitarMedios({ video: false, audio: true }, callbackÉxito);
                    } else {
                        console.error("[CRÍTICO] El dispositivo no tiene ni micrófono ni cámara funcionales.");
                        alert("ERROR DE HARDWARE: El navegador denegó el acceso o no detectó ningún micrófono ni cámara en este equipo.");
                    }
                });
        }

        document.getElementById('btnAccion').addEventListener('click', () => {
            if (!socket || !socket.connected) {
                alert("No puedes llamar todavía: No estás conectado al servidor de Render.");
                return;
            }

            console.log("[ACCION] Se pulsó el botón de iniciar llamada.");
            
            solicitarMedios({ video: true, audio: true }, () => {
                console.log("[PASO 5] Inicializando conexión WebRTC (RTCPeerConnection)...");
                peerConnection = new RTCPeerConnection(rtcConfig);
                
                if (localStream) {
                    localStream.getTracks().forEach(track => {
                        peerConnection.addTrack(track, localStream);
                        console.log(`-> Pista de audio/vídeo acoplada a WebRTC: ${track.kind}`);
                    });
                }

                peerConnection.onicecandidate = event => {
                    if (event.candidate) {
                        console.log("[WEBRTC] Enviando candidato ICE al servidor...");
                        socket.emit('relay-signaling', { target: miDestinatario, payload: { type: 'candidate', candidate: event.candidate } });
                    }
                };

                peerConnection.ontrack = event => {
                    console.log("[WEBRTC] ¡Pista de vídeo remota recibida! Acoplando al recuadro superior.");
                    document.getElementById('remoteVideo').srcObject = event.streams[0];
                };

                console.log("[PASO 6] Creando oferta de llamada (Offer SDP)...");
                peerConnection.createOffer()
                    .then(offer => {
                        console.log("[PASO 7] Aplicando descripción local a la conexión...");
                        return peerConnection.setLocalDescription(offer);
                    })
                    .then(() => {
                        console.log(`[PASO 8] Enviando oferta SDP a través del servidor hacia: ${miDestinatario}`);
                        socket.emit('relay-signaling', { target: miDestinatario, payload: { type: 'offer', sdp: peerConnection.localDescription } });
                        alert(`Llamada enviada a ${miDestinatario.toUpperCase()}. Esperando a que acepte...`);
                    })
                    .catch(e => {
                        console.error("[CRÍTICO] Fallo al generar el enlace WebRTC:", e);
                        alert("Error interno al crear la oferta de la videollamada.");
                    });
            });
        });

        function configurarSenales() {
            socket.on('signaling-message', data => {
                const payload = data.payload;
                console.log(`[SEÑAL RECIBIDA] Tipo de mensaje recibido del servidor: ${payload.type}`);
                
                if (payload.type === 'offer') {
                    console.log("[WEBRTC] Detectada oferta entrante. Levantando llamada entrante...");
                    alert(`¡${miDestinatario.toUpperCase()} te está llamando! Conectando...`);
                    
                    solicitarMedios({ video: true, audio: true }, () => {
                        peerConnection = new RTCPeerConnection(rtcConfig);
                        
                        if (localStream) {
                            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                        }

                        peerConnection.onicecandidate = event => {
                            if (event.candidate) {
                                socket.emit('relay-signaling', { target: miDestinatario, payload: { type: 'candidate', candidate: event.candidate } });
                            }
                        };

                        peerConnection.ontrack = event => {
                            document.getElementById('remoteVideo').srcObject = event.streams[0];
                        };

                        console.log("[WEBRTC] Procesando descripción remota recibida...");
                        peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
                            .then(() => {
                                console.log("[WEBRTC] Generando respuesta de llamada (Answer SDP)...");
                                return peerConnection.createAnswer();
                            })
                            .then(answer => {
                                console.log("[WEBRTC] Seteando descripción local de respuesta...");
                                return peerConnection.setLocalDescription(answer);
                            })
                            .then(() => {
                                console.log("[WEBRTC] Enviando respuesta de vuelta al emisor...");
                                socket.emit('relay-signaling', { target: miDestinatario, payload: { type: 'answer', sdp: peerConnection.localDescription } });
                            })
                            .catch(e => console.error("[ERROR] Fallo respondiendo la llamada WebRTC:", e));
                    });
                } 
                else if (payload.type === 'answer') {
                    console.log("[WEBRTC] Respuesta recibida del servidor. Enlazando flujos de datos definitivos...");
                    peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
                        .then(() => alert("¡Conexión establecida! Deberíais empezar a veros u oiros ya."))
                        .catch(e => console.error("[ERROR] Fallo al procesar la Answer remota:", e));
                } 
                else if (payload.type === 'candidate' && peerConnection) {
                    console.log("[WEBRTC] Añadiendo candidato ICE remoto a la conexión...");
                    peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate))
                        .catch(e => console.error("[ERROR] Fallo al añadir el ICE candidate:", e));
                }
            });
        }
    </script>
</body>
</html>
