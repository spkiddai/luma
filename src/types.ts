export interface Profile { id: string; name: string; kind: 'local' | 'remote'; source: string; updatedAt: string }
export interface AppState { version: number; port: number; allowLan: boolean; autoStart: boolean; mode: 'rule' | 'global' | 'direct'; starting: boolean; coreError: string; launchAtLogin: boolean; selectedProfile: string; profiles: Profile[]; running: boolean; coreVersion: string | null; systemProxy: boolean; platform: string; appVersion: string; dataDirectory: string; profilesDirectory: string; lanAddresses: string[] }
export interface Connection { id: string; metadata: { host?: string; destinationIP: string; destinationPort: string; sourceIP?: string; network: string; type?: string; process?: string }; upload: number; download: number; chains: string[]; rule: string; start: string }
export interface Stats { upload: number; download: number; uploadTotal: number; downloadTotal: number; memory: number; connectionCount: number; connections: Connection[]; uptime: number }
export interface ProxyNode { name: string; type: string; all?: string[]; now?: string; history: { delay: number; time: string }[]; alive?: boolean; udp?: boolean; hidden?: boolean }
export interface Rule { type: string; payload: string; proxy: string }
export interface Log { time: string; level: string; message: string }
export interface LumaAPI {
  initialNavigation: { page: string; importProfile?: boolean };
  onNavigate(callback: (navigation: { page: string; importProfile?: boolean }) => void): () => void;
  reveal(data: { page: string; importProfile?: boolean }): Promise<void>;
  setLightweight(data: { enabled: boolean }): Promise<AppState>;
  state(): Promise<AppState>; stats(options?: { includeConnections: boolean }): Promise<Stats>; logs(): Promise<Log[]>;
  start(): Promise<AppState>; stop(): Promise<AppState>; restart(): Promise<AppState>;
  proxies(): Promise<Record<string, ProxyNode>>;
  selectProxy(data: { group: string; name: string }): Promise<void>;
  delay(data: { name: string }): Promise<{ delay: number }>;
  rules(): Promise<Rule[]>; closeConnection(data: { id?: string }): Promise<void>;
  setMode(data: { mode: AppState['mode'] }): Promise<AppState>;
  setSystemProxy(data: { enabled: boolean }): Promise<AppState>;
  importFile(): Promise<AppState>;
  importProfile(data: { name: string; url?: string; content?: string }): Promise<AppState>;
  selectProfile(data: { id: string }): Promise<AppState>; updateProfile(data: { id: string }): Promise<AppState>; deleteProfile(data: { id: string }): Promise<AppState>;
  profileContent(data: { id: string }): Promise<string>;
  saveProfile(data: { id: string; content: string }): Promise<AppState>;
  renameProfile(data: { id: string; name: string }): Promise<AppState>;
  settings(data: Partial<Pick<AppState, 'port' | 'allowLan' | 'autoStart' | 'launchAtLogin'>>): Promise<AppState>;
  openData(): Promise<void>; openDirectory(data: { kind: 'data' | 'profiles' | 'logs' }): Promise<void>; openDocs(): Promise<void>; window(data: { action: string }): Promise<void>; quit(): Promise<void>;
}
declare global { interface Window { luma?: LumaAPI } }
