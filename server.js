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
        // URL del servidor de señalización en Render
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

            // Ocultar pantalla de login, mostrar pantalla de llamada
            document.getElementById('setupScreen').style.display = 'none';
            document.getElementById('callScreen').style.display = 'flex';

            // Ajustar texto del botón según quién seas
            document.getElementById('btnAccion').innerText = `Llamar a ${miDestinatario.toUpperCase()}`;

            // Conectar al servidor de señalización
            socket = io(SERVIDOR_URL);
            
            socket.on('connect', () => {
                console.log("¡Conectado con éxito al servidor de Render!");
            });

            socket.emit('register', miUsuario);

            // Escuchar señales entrantes
            configurarSenales();
        }

        async function arrancarMedios() {
            if (!localStream) {
                // Intento estándar: Cámara y micrófono activos
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                document.getElementById('localVideo').srcObject = localStream;
            }
        }

        document.getElementById('btnAccion').addEventListener('click', async () => {
            try {
                await arrancarMedios();
            } catch (error) {
                console.warn("No se detectó hardware completo (cámara + micro). Reintentando solo audio...", error);
                try {
                    // Intento de emergencia si falta la webcam (típico de PC de torre)
                    localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                    document.getElementById('localVideo').srcObject = localStream;
                } catch (e) {
                    console.error("Tampoco hay micrófono disponible en este equipo.", e);
                    alert("Error: No se ha detectado ningún dispositivo de audio o vídeo. Conecta un micrófono o prueba directamente desde el móvil.");
                    return; 
                }
            }
            
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

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('relay-signaling', { target: miDestinatario, payload: { type: 'offer', sdp: offer } });
            console.log("Oferta enviada. Conectando llamada...");
        });

        function configurarSenales() {
            socket.on('signaling-message', async ({ payload }) => {
                if (payload.type === 'offer') {
                    try {
                        await arrancarMedios();
                    } catch (err) {
                        try {
                            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                            document.getElementById('localVideo').srcObject = localStream;
                        } catch (e) {
                            console.error("No se pueden responder medios.", e);
                        }
                    }
                    
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

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    
                    socket.emit('relay-signaling', { target: miDestinatario, payload: { type: 'answer', sdp: answer } });
                } 
                else if (payload.type === 'answer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                } 
                else if (payload.type === 'candidate' && peerConnection) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
            });
        }
    </script>
</body>
</html>
