export enum UserRole {
  OFFICER = 'OFFICER',
  EXECUTIVE = 'EXECUTIVE',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  CHIEF_CLERK = 'CHIEF_CLERK',
  LEAVE_OFFICER = 'LEAVE_OFFICER',
  IT = 'IT',
  SA = 'SA',
  EX = 'EX'
}

export interface Officer {
  id: number | string;
  biometric_id: string;  // Aligned with DB column biometric_id
  name: string;
  designation: string;
  role: UserRole;
  profile_pic?: string;
  dashboard_status?: string;
  eta?: string;
  post?: string;
  department?: string;
  official_phone?: string;
  address?: string;
  bio?: string;  // Keep bio as alias for backward compatibility, but DB uses bio
  designation_id?: number | string;
  designation_name?: string;
  department_id?: number | string;
  work_type?: string;
  username?: string;
  pending_profile_pic?: string;
  birthday?: string;
  join_date?: string;
}

export interface Department {
  id: number | string;
  name: string;
}

export interface Designation {
  id: number | string;
  name: string;
}

export interface Attendance {
  id: number | string;
  officer_id: number | string;
  date: string;
  time_in: string;
  time_out?: string;
  status: string;
  check_in?: string;
  check_out?: string;
  is_temporary?: boolean;
}

export interface AttendanceRecord extends Attendance {
  officer_name?: string;
  short_leave_minutes?: number;
  is_half_day?: boolean;
}

export interface AttendanceRegistryItem {
  id: number | string;
  name: string;
  designation: string;
  department: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'OFF-DUTY';
  check_in?: string;
  check_out?: string;
  officer_id?: number | string;
  official_status?: string;
  post?: string;
  leave_type?: string;
  biometric_hit?: boolean;
}

export interface LeaderboardEntry {
  officer_id: number | string;
  name: string;
  profile_pic?: string;
  points: number;
  rank: number;
  avatar?: string;
  post?: string;
  score?: number;
}

export interface Unavailability {
  id: number | string;
  officer_id: number | string;
  start_date: string;
  end_date: string;
  reason: string;
  date?: string;
  slot?: 'FULL' | 'AM' | 'PM';
}

export interface LeaveRequest {
  id: number | string;
  officer_id: number | string;
  leave_type?: string;
  start_date: string;
  end_date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  type: 'CASUAL' | 'SICK' | 'VACATION' | 'DUTY' | 'SHORT_LEAVE' | 'HALF_DAY';
  sub_type?: 'AM' | 'PM';
  created_at: string;
}

export interface LeaveBalance {
  casual: number;
  sick: number;
  vacation: number;
  casual_total: number;
  sick_total: number;
  vacation_total: number;
}

export interface Resource {
  id: number | string;
  name: string;
  type: string;
  description?: string;
  status?: string;
  specs?: string;
}

export interface ResourceBooking {
  id: number | string;
  resource_id: number | string;
  officer_id: number | string;
  start_time: string;
  end_time: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  resource?: Resource;
  purpose?: string;
  destination?: string;
  resource_name?: string;
  resource_type?: string;
}

export interface Circular {
  id: number | string;
  title: string;
  description?: string;
  file_url: string;
  created_at: string;
  category?: string;
  content?: string;
  read_by?: any[];
  document_number?: string;
  issued_date?: string;
}

export interface DiaryEntry {
  id: number | string;
  officer_id?: number | string;
  content: string;
  date: string;
  type?: string;
  category?: string;
  outcomes?: string;
  challenges?: string;
}

export interface Circle {
  id: number | string;
  name: string;
  description?: string;
  logo?: string;
  color?: string;
}

export interface CircleProject {
  id: number | string;
  circle_id: number | string;
  name: string;
  description?: string;
  title?: string;
}

export interface ProjectTask {
  id: number | string;
  project_id: number | string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: string;
  updates?: TaskUpdate[];
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TaskUpdate {
  id: number | string;
  task_id: number | string;
  content: string;
  type: 'MESSAGE' | 'STATUS_CHANGE';
  created_at: string;
  author_id?: string | number;
  author?: Officer;
}

export interface GalleryAlbum {
  id: number | string;
  name: string;
  description?: string;
  cover_url?: string;
  is_restricted?: boolean;
  officer_id?: number | string;
  creator?: { name: string };
  photos_count?: number;
  photos?: GalleryPhoto[];
  allowed_roles?: string[];
  allowed_departments?: string[];
  created_at?: string;
}

export interface GalleryPhoto {
  id: number | string;
  album_id: number | string;
  url: string;
  officer_id?: number | string;
  uploader?: { name: string };
  created_at?: string;
}

export interface AppNotification {
  id: number | string;
  user_id?: number | string;
  title: string;
  message: string;
  is_read: boolean;
  created_at?: string;
  type?: string;
  timestamp?: string;
}

export interface UserActivity {
  id: number | string;
  user_id?: number | string;
  activity?: string;
  created_at?: string;
  type?: string;
  title?: string;
  description?: string;
  timestamp?: string;
  icon?: string;
}

export interface DashboardNotice {
  id: number | string;
  content: string;
  is_active: boolean;
}

export interface DashboardEvent {
  id: number | string;
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  is_active: boolean;
  image_url?: string;
}

export interface DashboardVideo {
  id: number | string;
  video_url: string;
  url?: string;
  is_active: boolean;
}

export interface DashboardEmergencyAlert {
  id: number | string;
  message: string;
  is_active: boolean;
}

export interface DashboardSettings {
  id?: number | string;
  refresh_interval: number;
  scrolling_speed: number;
  video_source?: 'URL' | 'HDMI' | 'FILE' | 'LIVE';
  birthday_image_url?: string;
  video_playlist_skip?: string;
  default_cover_pic?: string;
}

export interface DashboardData {
  officers: Officer[];
  notices: DashboardNotice[];
  events: DashboardEvent[];
  videos: DashboardVideo[];
  emergency_alerts: DashboardEmergencyAlert[];
  alerts?: DashboardEmergencyAlert[];
  settings: DashboardSettings;
  birthdays: Officer[];
}
