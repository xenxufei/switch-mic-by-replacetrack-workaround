/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* global TimelineDataSeries, TimelineGraphView */

'use strict';

// (async function(){

    // window.getCitrixWebrtcRedir = () => new Promise(res => res(1));

    // await new Promise(res => {
    //     require(['./js/CitrixWebRTC.js'], () => {
    //         CitrixWebRTC.setVMEventCallback(event => {
    //             console.log(`Got Citrix VM Event:`, event)
    //             if ( event.event === 'vdiClientConnected') {
    //                 console.log('Citrix webrtc vdiClientConnected');
    //             } else if ( event.event == 'vdiClientDisconnected') {
    //                 console.log('Citrix webrtc disconnected');
    //             }
    //         });
    //         res();
    //     });
    // });

    const audio2 = document.querySelector('audio#audio2');
    const callButton = document.querySelector('button#callButton');
    const hangupButton = document.querySelector('button#hangupButton');
    const codecSelector = document.querySelector('select#codec');
    hangupButton.disabled = true;
    callButton.onclick = call;
    hangupButton.onclick = hangup;

    const audioInputSelect = document.querySelector('select#audioSource');
    const audioOutputSelect = document.querySelector('select#audioOutput');
    const selectors = [audioInputSelect, audioOutputSelect];
    function getConstraint() {
        const audioSource = audioInputSelect.value;
        const devId =  audioSource ? audioSource : undefined;
        const constraints = {
            audio: devId ? {deviceId: devId} : true
        };
        return constraints;
    }
    const localstreamContainer = {};
    const streams = [];
    function deviceSwitchHandle() {
        function gotDevices(deviceInfos) {
            // Handles being called several times to update labels. Preserve values.
            const values = selectors.map(select => select.value);
            selectors.forEach(select => {
                while (select.firstChild) {
                    select.removeChild(select.firstChild);
                }
            });
            console.log(`[gotDevices] device number is ${JSON.stringify(deviceInfos.length)}`);
            for (let i = 0; i !== deviceInfos.length; ++i) {
                const deviceInfo = deviceInfos[i];
                console.log(`[gotDevices] device[${i}] is ${JSON.stringify(deviceInfo)}`);
                const option = document.createElement('option');
                option.value = deviceInfo.deviceId;
                if (deviceInfo.kind === 'audioinput') {
                    option.text = deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
                    audioInputSelect.appendChild(option);
                } else if (deviceInfo.kind === 'audiooutput') {
                    option.text = deviceInfo.label || `speaker ${audioOutputSelect.length + 1}`;
                    audioOutputSelect.appendChild(option);
                } else {
                    console.log('Some other kind of source/device: ', deviceInfo);
                }
            }
            selectors.forEach((select, selectorIndex) => {
                if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
                    select.value = values[selectorIndex];
                }
            });
        }

        function handleError(error) {
            console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
        }

        function gotMicrophoneStream(stream) {
            let prevStream = localstreamContainer.stream;
            localstreamContainer.stream =stream;
            if (callButton.disabled && !hangupButton.disabled) { // in a call
                var outTrack = stream.getAudioTracks()[0];
                if (outTrack)
                    var sender =  pc1.getSenders().find(function(s) {
                        return s.track.kind === outTrack.kind;
                    });
                if (sender) {
                    console.log("gotMicrophoneStream:replaceTrack entry, new track ID:" + outTrack.id 
                        + " readyState:" + outTrack.readyState);
                    sender.replaceTrack(outTrack)
                        .then(() => {
                            console.log("gotMicrophoneStream:replaceTrack succeeds, track ID:" + outTrack.id + " readyState:" + outTrack.readyState);
                        })
                        .catch((e) => {
                            console.log("gotMicrophoneStream:replaceTrack fails, track ID:" + outTrack.id + " readyState:" + outTrack.readyState + " e:" + JSON.stringify(e));
                        })
                        .finally(() => {
                            console.log("gotMicrophoneStream:replaceTrack finally, stop old outoing audio track");
                            // stop old outoing audio track
                            if (prevStream) {
                                prevStream.getTracks().forEach( (track) => {
                                    track.stop();
                                });
                            }
                        });
                }
            } else {
                console.log("gotMicrophoneStream:common, stop old outoing audio track");
                // stop old outoing audio track
                if (prevStream) {
                    prevStream.getTracks().forEach( (track) => {
                        track.stop();
                    });
                }
            }
            // return CitrixWebRTC.enumerateDevices();
            return navigator.mediaDevices.enumerateDevices();
        }
        function init() {
            // CitrixWebRTC.getUserMedia(getConstraint()).then(gotMicrophoneStream).then(gotDevices).catch(handleError);
            navigator.mediaDevices.getUserMedia(getConstraint()).then(gotMicrophoneStream).then(gotDevices).catch(handleError);
        }

        function onMicrophoneChanged() {
            if (callButton.disabled && !hangupButton.disabled) {
                // stop current track
                // localstreamContainer.stream.getTracks().forEach( (track) => {
                //     track.stop();
                // });
                // delete localstreamContainer.stream;

                // CitrixWebRTC.getUserMedia(getConstraint()).then(gotMicrophoneStream).then(gotDevices).catch(handleError);
                navigator.mediaDevices.getUserMedia(getConstraint()).then(gotMicrophoneStream).then(gotDevices).catch(handleError);
            } else {
                init();
            }
        }

        audioInputSelect.onchange = onMicrophoneChanged;
        init();
    }

    // init audio device handle
    deviceSwitchHandle();

    // Google's sample code for peerConnection audio only

    let pc1;
    let pc2;
    let localStream;

    let bitrateGraph;
    let bitrateSeries;
    let targetBitrateSeries;
    let headerrateSeries;

    let packetGraph;
    let packetSeries;

    let lastResult;

    const offerOptions = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 0,
        voiceActivityDetection: false
    };

    const audioLevels = [];
    let audioLevelGraph;
    let audioLevelSeries;

// Enabling opus DTX is an expert option without GUI.
// eslint-disable-next-line prefer-const
    let useDtx = false;

// Disabling Opus FEC is an expert option without GUI.
// eslint-disable-next-line prefer-const
    let useFec = true;

// We only show one way of doing this.
    const codecPreferences = document.querySelector('#codecPreferences');
    const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
        'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
    if (supportsSetCodecPreferences) {
        codecSelector.style.display = 'none';

        const {codecs} = RTCRtpSender.getCapabilities('audio');
        codecs.forEach(codec => {
            if (['audio/CN', 'audio/telephone-event'].includes(codec.mimeType)) {
                return;
            }
            const option = document.createElement('option');
            option.value = (codec.mimeType + ' ' + codec.clockRate + ' ' +
                (codec.sdpFmtpLine || '')).trim();
            option.innerText = option.value;
            codecPreferences.appendChild(option);
        });
        codecPreferences.disabled = false;
    } else {
        codecPreferences.style.display = 'none';
    }

    let retryCreateOfferStarted = false;
    let iceCandFromPc1 = "";
    let iceCandFromPc2 = "";

    function triggerCreateOfferProc() {
        console.info("pc1 createOffer");
        pc1.createOffer(gotDescription1, onCreateSessionDescriptionError, offerOptions);
    }


    function gotStream(stream) {
        hangupButton.disabled = false;
        console.log('Received local stream');
        localStream = stream;
        if(localstreamContainer.stream) {
            localstreamContainer.stream.getTracks().forEach( (track) => {
                track.stop();
            });
            delete localstreamContainer.stream;
        }

        localstreamContainer.stream = stream;
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log(`Using Audio device: ${audioTracks[0].label}`);
        }
        localstreamContainer.stream.getTracks().forEach(track => pc1.addTrack(track, localstreamContainer.stream));
        console.log('Adding Local Stream to peer connection');

        triggerCreateOfferProc();

    }

    function onCreateSessionDescriptionError(error) {
        console.log(`Failed to create session description: ${error.toString()}`);
    }

    function call() {
        callButton.disabled = true;
        codecSelector.disabled = true;
        console.log('Starting call');
        const servers = null;
        // pc1 = new CitrixWebRTC.CitrixPeerConnection();
        pc1 = new RTCPeerConnection(servers);
        console.log('Created local peer connection object pc1');
        pc1.onicecandidate = e => onIceCandidate(pc1, e);
        // pc2 = new CitrixWebRTC.CitrixPeerConnection();
        pc2 = new RTCPeerConnection(servers);
        console.log('Created remote peer connection object pc2');
        pc2.onicecandidate = e => onIceCandidate(pc2, e);
        pc2.ontrack = gotRemoteStream;
        // CitrixWebRTC.mapAudioElement(audio2);
        console.log('Requesting local stream');
        navigator.mediaDevices.getUserMedia(getConstraint())
            .then(gotStream);
    }

    function gotDescription1(desc) {
        console.log(`Offer from pc1\n${desc.sdp}`);
        pc1.setLocalDescription(desc)
            .then(() => {
                if (!supportsSetCodecPreferences) {
                    desc.sdp = forceChosenAudioCodec(desc.sdp);
                }
                pc2.setRemoteDescription(desc).then(() => {
                    return pc2.createAnswer(gotDescription2, onCreateSessionDescriptionError);
                }, onSetSessionDescriptionError);
            }, onSetSessionDescriptionError);
    }

    function gotDescription2(desc) {
        console.log(`Answer from pc2\n${desc.sdp}`);

        pc2.setLocalDescription(desc).then(() => {
            if (!supportsSetCodecPreferences) {
                desc.sdp = forceChosenAudioCodec(desc.sdp);
            }
            if (useDtx) {
                desc.sdp = desc.sdp.replace('useinbandfec=1', 'useinbandfec=1;usedtx=1');
            }
            if (!useFec) {
                desc.sdp = desc.sdp.replace('useinbandfec=1', 'useinbandfec=0');
            }
            pc1.setRemoteDescription(desc).then(() => {
                setTimeout(() => {
                    if (!retryCreateOfferStarted) {
                        retryCreateOfferStarted = true;
                        triggerCreateOfferProc();
                    }
                }, 3000); // The CitrixWebRTC UC SDK doesn't support pc.addIceCandidate() yet, we have to either edit it in the SDP, or re-trigger the SDP-negotiation process after 3000ms
            }, onSetSessionDescriptionError);
        }, onSetSessionDescriptionError);
    }

    function hangup() {
        console.log('Ending call');
        localstreamContainer.stream.getTracks().forEach(track => track.stop());
        pc1.close();
        pc2.close();
        pc1 = null;
        pc2 = null;
        hangupButton.disabled = true;
        callButton.disabled = false;
        codecSelector.disabled = false;
        retryCreateOfferStarted = false;
        iceCandFromPc1 = "";
        iceCandFromPc2 = "";
    }

    function gotRemoteStream(e) {

        audio2.srcObject = e.streams[0];
        audio2.play();
        console.info('----------Received remote stream now playing');
    }

    function getOtherPc(pc) {
        return (pc === pc1) ? pc2 : pc1;
    }

    function getName(pc) {
        return (pc === pc1) ? 'pc1' : 'pc2';
    }

    function onIceCandidate(pc, event) {
        let dtt = new Date();
        if (event.candidate) {
            let cand = event.candidate.candidate;
            console.log(`${getName(pc)} onIceCandidate: (${cand})`);

            if (pc == pc1) {
                iceCandFromPc1 = iceCandFromPc1.concat("a=", cand, "\r\n");
            }
            else if (pc == pc2) {
                iceCandFromPc2 = iceCandFromPc2.concat("a=", cand, "\r\n");
            }
        }

        console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
    }

    function onAddIceCandidateSuccess() {
        console.log('AddIceCandidate success.');
    }

    function onAddIceCandidateError(error) {
        console.log(`Failed to add ICE Candidate: ${error.toString()}`);
    }


    function onSetSessionDescriptionError(error) {
        console.log(`Failed to set session description: ${error.toString()}`);
    }

    function forceChosenAudioCodec(sdp) {
        return maybePreferCodec(sdp, 'audio', 'send', codecSelector.value);
    }

// Copied from AppRTC's sdputils.js:

// Sets |codec| as the default |type| codec if it's present.
// The format of |codec| is 'NAME/RATE', e.g. 'opus/48000'.
    function maybePreferCodec(sdp, type, dir, codec) {
        const str = `${type} ${dir} codec`;
        if (codec === '') {
            console.log(`No preference on ${str}.`);
            return sdp;
        }

        console.log(`Prefer ${str}: ${codec}`);

        const sdpLines = sdp.split('\r\n');

        // Search for m line.
        const mLineIndex = findLine(sdpLines, 'm=', type);
        if (mLineIndex === null) {
            return sdp;
        }

        // If the codec is available, set it as the default in m line.
        const codecIndex = findLine(sdpLines, 'a=rtpmap', codec);
        console.log('codecIndex', codecIndex);
        if (codecIndex) {
            const payload = getCodecPayloadType(sdpLines[codecIndex]);
            if (payload) {
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], payload);
            }
        }

        sdp = sdpLines.join('\r\n');
        return sdp;
    }

// Find the line in sdpLines that starts with |prefix|, and, if specified,
// contains |substr| (case-insensitive search).
    function findLine(sdpLines, prefix, substr) {
        return findLineInRange(sdpLines, 0, -1, prefix, substr);
    }

// Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
// and, if specified, contains |substr| (case-insensitive search).
    function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
        const realEndLine = endLine !== -1 ? endLine : sdpLines.length;
        for (let i = startLine; i < realEndLine; ++i) {
            if (sdpLines[i].indexOf(prefix) === 0) {
                if (!substr ||
                    sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
                    return i;
                }
            }
        }
        return null;
    }

// Gets the codec payload type from an a=rtpmap:X line.
    function getCodecPayloadType(sdpLine) {
        const pattern = new RegExp('a=rtpmap:(\\d+) \\w+\\/\\d+');
        const result = sdpLine.match(pattern);
        return (result && result.length === 2) ? result[1] : null;
    }

// Returns a new m= line with the specified codec as the first one.
    function setDefaultCodec(mLine, payload) {
        const elements = mLine.split(' ');

        // Just copy the first three parameters; codec order starts on fourth.
        const newLine = elements.slice(0, 3);

        // Put target payload first and copy in the rest.
        newLine.push(payload);
        for (let i = 3; i < elements.length; i++) {
            if (elements[i] !== payload) {
                newLine.push(elements[i]);
            }
        }
        return newLine.join(' ');
    }

// })();
