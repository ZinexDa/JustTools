use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use regex::Regex;

fn get_default_yt_dlp_args(app: &AppHandle) -> Result<Vec<String>, String> {
    let ffmpeg_path_or_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .to_string_lossy()
        .to_string();

    Ok(vec![
        "--user-agent".to_string(),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36".to_string(),
        "--extractor-args".to_string(),
        "youtube:player_client=android,web".to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_path_or_dir,
        "--concurrent-fragments".to_string(),
        "4".to_string(),
    ])
}

fn format_yt_dlp_error(stderr: &[u8]) -> String {
    let raw_error = String::from_utf8_lossy(stderr);
    let mut user_msg = String::new();
    
    // Check for common signs of anti-bot measures or outdated extractors
    if raw_error.contains("Sign in to confirm") 
        || raw_error.contains("Video unavailable")
        || raw_error.contains("Requested format is not available") 
        || raw_error.contains("HTTP Error 403: Forbidden")
        || raw_error.contains("Unable to download webpage")
        || raw_error.contains("Too Many Requests")
        || raw_error.contains("bot")
        || raw_error.contains("captcha") {
            user_msg.push_str("Platform blocked the request or requires authentication.\n");
    } else {
            user_msg.push_str("Failed to fetch video information.\n");
    }

    user_msg.push_str("\nTry updating yt-dlp to the latest version via the Settings tab.");
    
    // Optionally include original error detail for debug purposes locally (or just return the friendly string)
    format!("{}\n\nTechnical details:\n{}", user_msg, raw_error.trim())
}

#[tauri::command]
async fn get_video_info(app: AppHandle, url: String) -> Result<String, String> {
    let mut args = get_default_yt_dlp_args(&app)?;
    args.push("--dump-json".to_string());
    args.push(url);

    let sidecar_command = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(args);

    let output = sidecar_command
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to parse stdout as utf8: {}", e))
    } else {
        Err(format_yt_dlp_error(&output.stderr))
    }
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    progress_percent: f64,
    speed: String,
    eta: String,
}

#[tauri::command]
async fn download_media(
    app: AppHandle,
    url: String,
    format_id: String,
    output_path: String,
) -> Result<(), String> {
    let mut args = get_default_yt_dlp_args(&app)?;
    
    args.extend(vec![
        "-o".to_string(),
        output_path,
        "-f".to_string(),
        format_id.clone(),
        "--no-warnings".to_string(),
    ]);

    if format_id == "bestaudio/best" {
        args.push("--extract-audio".to_string());
        args.push("--audio-format".to_string());
        args.push("mp3".to_string());
    }
    
    args.push(url);

    let sidecar_command = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(args);

    let (mut rx, mut _child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    let progress_regex = Regex::new(r"\[download\]\s+([\d\.]+)\%\s+of.*?at\s+([\d\.\w/]+)(?:\s+ETA\s+([\d:]+))?").unwrap();

    tauri::async_runtime::spawn(async move {
        // Collect stderr to optionally emit an error object containing our formatted message.
        // Wait for child events to finish
        let mut stderr_acc = Vec::new();
        let mut child_failed = false;
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    if let Some(captures) = progress_regex.captures(&line) {
                        if let (Some(percent_m), Some(speed_m)) = (captures.get(1), captures.get(2)) {
                            let percent: f64 = percent_m.as_str().parse().unwrap_or(0.0);
                            let speed = speed_m.as_str().to_string();
                            let eta = captures.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();

                            let _ = app.emit(
                                "download-progress",
                                DownloadProgress {
                                    progress_percent: percent,
                                    speed,
                                    eta,
                                },
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    stderr_acc.extend_from_slice(&line_bytes);
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprintln!("yt-dlp error: {}", line);
                }
                CommandEvent::Error(err) => {
                    stderr_acc.extend_from_slice(err.as_bytes());
                    child_failed = true;
                }
                CommandEvent::Terminated(payload) => {
                    if payload.code != Some(0) {
                        child_failed = true;
                    }
                }
                _ => {},
            }
        }

        if child_failed {
            let error_msg = format_yt_dlp_error(&stderr_acc);
            let _ = app.emit("download-error", error_msg);
        }
    });

    Ok(())
}

#[derive(Clone, Serialize)]
struct ConversionProgress {
    progress_percent: f64,
    time_str: String,
}

fn parse_time_to_seconds(time_str: &str) -> Option<f64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().unwrap_or(0.0);
        let m: f64 = parts[1].parse().unwrap_or(0.0);
        let s: f64 = parts[2].parse().unwrap_or(0.0);
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}

#[tauri::command]
async fn convert_local_file(
    app: AppHandle,
    input_path: String,
    output_path: String,
    _target_format: String,
) -> Result<(), String> {
    
    let sidecar_command = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create ffmpeg sidecar: {}", e))?
        .args(["-nostdin", "-y", "-i", &input_path, &output_path]);

    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

    let duration_regex = Regex::new(r"Duration:\s+(\d\d:\d\d:\d\d\.\d\d)").unwrap();
    let time_regex = Regex::new(r"time=(\d\d:\d\d:\d\d\.\d\d)").unwrap();

    tauri::async_runtime::spawn(async move {
        let _child = child;
        let mut total_duration = 0.0;
        
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stderr(line_bytes) = event {
                let line = String::from_utf8_lossy(&line_bytes);
                
                // Parse duration if we haven't got it yet
                if total_duration == 0.0 {
                    if let Some(caps) = duration_regex.captures(&line) {
                        if let Some(dur_str) = caps.get(1) {
                            if let Some(secs) = parse_time_to_seconds(dur_str.as_str()) {
                                total_duration = secs;
                            }
                        }
                    }
                }
                
                // Parse progress time
                if let Some(caps) = time_regex.captures(&line) {
                    if let Some(time_str) = caps.get(1) {
                        let t_str = time_str.as_str();
                        if let Some(secs) = parse_time_to_seconds(t_str) {
                            let percent = if total_duration > 0.0 {
                                (secs / total_duration) * 100.0
                            } else {
                                0.0
                            };
                            
                            let _ = app.emit(
                                "conversion-progress",
                                ConversionProgress {
                                    progress_percent: percent.min(100.0),
                                    time_str: t_str.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }
        
        let _ = app.emit(
            "conversion-progress",
            ConversionProgress {
                progress_percent: 100.0,
                time_str: "Done".to_string(),
            },
        );
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_video_info,
            download_media,
            convert_local_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
