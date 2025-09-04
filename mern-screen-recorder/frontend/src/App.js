import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'http://localhost:5000';

function App() {
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [recordingsList, setRecordingsList] = useState([]);
  const [timer, setTimer] = useState(0);
  const [maxTimeReached, setMaxTimeReached] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const videoPreviewRef = useRef(null);

  // Fetch recordings on component mount
  useEffect(() => {
    fetchRecordings();
  }, []);

  // Handle timer
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev >= 179) { // 3 minutes minus 1 second
            handleStopRecording();
            setMaxTimeReached(true);
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [recording]);

  const fetchRecordings = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/recordings`);
      setRecordingsList(response.data);
    } catch (error) {
      console.error('Error fetching recordings:', error);
    }
  };

  const startRecording = async () => {
    try {
      // Reset states
      setRecordedChunks([]);
      setRecordedVideo(null);
      setTimer(0);
      setMaxTimeReached(false);

      // Get display media (screen) and audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' }
      });
      
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      // Combine streams
      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioStream.getAudioTracks()
      ]);

      streamRef.current = combinedStream;

      // Setup media recorder
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedChunks(chunks);
        setRecordedVideo(videoUrl);
        
        // Clean up streams
        streamRef.current.getTracks().forEach(track => track.stop());
      };

      // Start recording
      mediaRecorder.start(1000); // Capture chunks every second
      setRecording(true);

      // Handle if user stops sharing screen
      displayStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorder.state === 'recording') {
          handleStopRecording();
        }
      };

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error starting recording. Please check permissions and try again.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const downloadRecording = () => {
    if (recordedChunks.length === 0) return;
    
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen-recording-${new Date().toISOString()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadRecording = async () => {
    if (recordedChunks.length === 0) return;
    
    try {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video', blob, `recording-${Date.now()}.webm`);
      
      await axios.post(`${API_BASE_URL}/api/recordings`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      alert('Recording uploaded successfully!');
      fetchRecordings(); // Refresh the list
    } catch (error) {
      console.error('Error uploading recording:', error);
      alert('Error uploading recording. Please try again.');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-blue-600">Screen Recorder</h1>
        
        {/* Recording Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="text-2xl font-mono mb-2">
              {formatTime(timer)}
              {maxTimeReached && <span className="text-red-500 ml-2">(Max time reached)</span>}
            </div>
            
            <div className="flex space-x-4">
              {!recording ? (
                <button 
                  onClick={startRecording}
                  className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                >
                  Start Recording
                </button>
              ) : (
                <button 
                  onClick={handleStopRecording}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                >
                  Stop Recording
                </button>
              )}
            </div>
            
            <p className="text-sm text-gray-500 text-center">
              {recording 
                ? "Recording in progress. Share your screen when prompted." 
                : "Click Start Recording to begin. You'll be asked to share your screen and microphone."}
            </p>
          </div>
        </div>
        
        {/* Video Preview */}
        {recordedVideo && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Recording Preview</h2>
            <div className="flex flex-col items-center">
              <video 
                ref={videoPreviewRef}
                src={recordedVideo} 
                controls 
                className="w-full max-w-2xl mb-4 rounded-lg"
              />
              <div className="flex space-x-4">
                <button 
                  onClick={downloadRecording}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Download
                </button>
                <button 
                  onClick={uploadRecording}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  Upload to Server
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Recordings List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Uploaded Recordings</h2>
          {recordingsList.length === 0 ? (
            <p className="text-gray-500">No recordings uploaded yet.</p>
          ) : (
            <div className="space-y-4">
              {recordingsList.map(recording => (
                <div key={recording.id} className="border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">{recording.filename}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(recording.createdAt).toLocaleString()} • 
                      {(recording.filesize / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <a 
                    href={`${API_BASE_URL}/api/recordings/${recording.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Play
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;