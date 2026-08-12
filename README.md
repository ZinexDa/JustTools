# 🛠️ JustTools

[![Tauri v2](https://img.shields.io/badge/Tauri--v2-24C8DB?logo=tauri&logoColor=white)](#)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](#)

**JustTools** is a modern and efficient desktop application providing convenient tools for working with media files. It combines a media hub, format converter, and a user-friendly interface, delivering high performance through the powerful combination of Tauri, Rust, and TypeScript.

## 🚀 Key Features

- 🎬 **Media Hub** — Conveniently manage and view your media files in one place.
- 🔄 **Converter** — Built-in tool for fast file format conversion.
- 🖱️ **Drag & Drop Interface** — Intuitive and fast file addition by simply dragging and dropping them into the app window.
- 🖼️ **Custom Window Styling** — Modern design and unique window interface without standard OS frames.

## 💻 Tech Stack

- **Tauri v2** — Framework for building cross-platform desktop applications with minimal bundle size and high performance.
- **Rust** — Systems programming language ensuring safety and speed for the application's core.
- **TypeScript** — Strongly typed language for writing reliable frontend logic.
- **Vite & CSS** — Lightning-fast build tool and UI styling.

## 🛠️ Getting Started (Local Development)

### Prerequisites

Ensure you have the following components installed on your system:
- **[Node.js](https://nodejs.org/)** (LTS version recommended)
- **[Rust Toolchain (Cargo)](https://www.rust-lang.org/tools/install)**
- Necessary OS dependencies for Tauri (depending on your OS, see the [Tauri documentation](https://v2.tauri.app/start/prerequisites/))

### Install Dependencies

Open a terminal in the root folder of the project and run the following command to install Node.js packages:

```bash
npm install
```

### Run in Development Mode

To run the application in development mode (with hot-reload for both the frontend UI and Rust backend):

```bash
npm run tauri dev
```

### Build the Application

To build the final production release executable for your operating system:

```bash
npm run tauri build
```

The compiled binary files (installers/executables) will be located in the `src-tauri/target/release/` folder after the build process completes.

## 📁 Project Structure

The project is divided into two main parts: the frontend interface and the core backend.

- **`src/`** — Frontend source code (TypeScript, CSS, Vite configuration). Contains the UI, styles, and frontend logic.
- **`src-tauri/`** — Core backend source code written in Rust. Handles OS interactions, window creation and configuration, complex system calls, and the conversion logic.

## 📄 License

This project is licensed under the **MIT License**.