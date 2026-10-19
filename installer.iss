; Script de Inno Setup 6 para MCU Maker
; Genera el instalador oficial de Windows para estudiantes y desarrolladores.

#define MyAppName "MCU Maker"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Walther Curo De La Cruz"
#define MyAppURL "http://localhost:8001"
#define MyAppExeName "mcu-maker-launcher.exe"
#define MyAppCopyright "MCU Maker - Un proyecto basado en Velxio.dev con Backend 100% en Rust. Desarrollador: Walther Curo De La Cruz"
#define MyAppComments "MCU Maker - Un proyecto basado en Velxio.dev con Backend 100% en Rust. Desarrollador: Walther Curo De La Cruz"

[Setup]
AppId={{C6D2B149-9A08-4B33-A227-E9461148722A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
AppCopyright={#MyAppCopyright}
AppComments={#MyAppComments}
VersionInfoDescription=MCU Maker — Plataforma Abierta de Simulación de Microcontroladores
VersionInfoProductName=MCU Maker
VersionInfoCompany=Walther Curo De La Cruz
VersionInfoCopyright={#MyAppCopyright}
VersionInfoVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=LICENSE

; Modo no-elevado por defecto (permite instalar en computadoras de alumnos sin clave de administrador)
; Si se ejecuta como Administrador o el usuario lo elige, se instala para todos los usuarios.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

OutputDir=dist-installer
OutputBaseFilename=MCU-Maker-Setup-v{#MyAppVersion}
SetupIconFile=prebuilt\picsimlab\picsimlab_win64\share\picsimlabw.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; Desinstalador limpio
UninstallDisplayIcon={app}\mcu-maker.ico
UninstallDisplayName={#MyAppName}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Binarios compilados en Rust nativo (Release)
Source: "rust\target\release\mcu-maker-launcher.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "rust\target\release\mcu-maker-server.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "rust\target\release\mcu-maker-worker.exe"; DestDir: "{app}"; Flags: ignoreversion

; Icono oficial de la aplicacion
Source: "prebuilt\picsimlab\picsimlab_win64\share\picsimlabw.ico"; DestDir: "{app}"; DestName: "mcu-maker.ico"; Flags: ignoreversion

; Motor de ejecucion QEMU Xtensa/STM32/RISC-V (DLLs, ROMs y dependencias MinGW)
Source: "prebuilt\qemu_runtime\*"; DestDir: "{app}\prebuilt\qemu_runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

; Herramienta de compilacion Arduino CLI integrada
Source: "prebuilt\arduino-cli\*"; DestDir: "{app}\prebuilt\arduino-cli"; Flags: ignoreversion recursesubdirs createallsubdirs

; Interfaz Web y simulador SPA precompilado
Source: "frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

; Licencias y documentacion de atribucion
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "MANUAL_PROYECTO_V1.md"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\artifacts"; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\mcu-maker.ico"; Comment: "MCU Maker — Plataforma Abierta de Simulación de Microcontroladores"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\mcu-maker.ico"; Tasks: desktopicon; Comment: "MCU Maker — Plataforma Abierta de Simulación de Microcontroladores"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
