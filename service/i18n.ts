export type TranslationKey = 
  | 'home' 
  | 'feed' 
  | 'map' 
  | 'notifications' 
  | 'admin' 
  | 'media' 
  | 'profile' 
  | 'circles' 
  | 'logout' 
  | 'searchPlaceholder'
  | 'officerAvailability'
  | 'upcomingEvents'
  | 'todayBirthdays'
  | 'emergencyAlert'
  | 'statusAvailable'
  | 'statusBusy'
  | 'statusAway'
  | 'statusOnLeave'
  | 'eta'
  | 'noEvents'
  | 'noBirthdays'
  | 'finish'
  | 'usability'
  | 'teamwork'
  | 'proactive'
  | 'impact'
  | 'broadcastPlaceholder'
  | 'welcome'
  | 'todayIs'
  | 'logInTime'
  | 'outEligibility'
  | 'eligibleForDeparture'
  | 'myLeave'
  | 'leavesTaken'
  | 'leavesRemaining'
  | 'shortLeaves'
  | 'commandCenter'
  | 'attendance'
  | 'officialJournal'
  | 'communityPulse'
  | 'trendingNow'
  | 'topContributors'
  | 'polishPost'
  | 'polishing'
  | 'broadcast'
  | 'loading'
  | 'saveOfficer'
  | 'manageStaff'
  | 'addOfficer'
  | 'editOfficer';

export const translations: Record<'EN' | 'SI', Record<TranslationKey, string>> = {
  EN: {
    home: 'Home',
    feed: 'Feed',
    map: 'Map',
    notifications: 'Notifications',
    admin: 'Admin',
    media: 'Media',
    profile: 'Profile',
    circles: 'Circles',
    logout: 'Logout',
    searchPlaceholder: 'Search...',
    officerAvailability: 'Officer Availability',
    upcomingEvents: 'Upcoming Events',
    todayBirthdays: "Today's Birthdays",
    emergencyAlert: 'Emergency Alert',
    statusAvailable: 'Available',
    statusBusy: 'Busy',
    statusAway: 'Away',
    statusOnLeave: 'On Leave',
    eta: 'ETA',
    noEvents: 'No upcoming events',
    noBirthdays: 'No birthdays today',
    finish: 'Finish',
    usability: 'Usability',
    teamwork: 'Teamwork',
    proactive: 'Proactive',
    impact: 'Impact',
    broadcastPlaceholder: 'What is happening in Niyagama?',
    welcome: 'Welcome',
    todayIs: 'Today is',
    logInTime: 'Log-in Time',
    outEligibility: 'Out Eligibility',
    eligibleForDeparture: 'Eligible for Departure',
    myLeave: 'My Leave',
    leavesTaken: 'Leaves Taken',
    leavesRemaining: 'Leaves Remaining',
    shortLeaves: 'Short Leaves',
    commandCenter: 'Command Center',
    attendance: 'Attendance',
    officialJournal: 'Official Journal',
    communityPulse: 'Community Pulse',
    trendingNow: 'Trending Now',
    topContributors: 'Top Contributors',
    polishPost: 'Polish Post',
    polishing: 'Polishing...',
    broadcast: 'Broadcast',
    loading: 'Loading...',
    saveOfficer: 'Save Officer',
    manageStaff: 'Manage Staff',
    addOfficer: 'Add Officer',
    editOfficer: 'Edit Officer'
  },
  SI: {
    home: 'මුල් පිටුව',
    feed: 'පුවත්',
    map: 'සිතියම',
    notifications: 'දැනුම්දීම්',
    admin: 'පරිපාලන',
    media: 'මාධ්‍ය',
    profile: 'පැතිකඩ',
    circles: 'කව',
    logout: 'පිටවීම',
    searchPlaceholder: 'සොයන්න...',
    officerAvailability: 'නිලධාරීන්ගේ පැමිණීම',
    upcomingEvents: 'ඉදිරි සිදුවීම්',
    todayBirthdays: 'අද උපන් දින',
    emergencyAlert: 'හදිසි අනතුරු ඇඟවීම',
    statusAvailable: 'පවතී',
    statusBusy: 'කාර්යබහුලයි',
    statusAway: 'බැහැරව',
    statusOnLeave: 'නිවාඩු මත',
    eta: 'ඇස්තමේන්තුගත කාලය',
    noEvents: 'ඉදිරි සිදුවීම් නොමැත',
    noBirthdays: 'අද උපන් දින නොමැත',
    finish: 'අවසන් කරන්න',
    usability: 'භාවිතා කිරීමේ හැකියාව',
    teamwork: 'කණ්ඩායම් වැඩ',
    proactive: 'ක්‍රියාශීලී',
    impact: 'බලපෑම',
    broadcastPlaceholder: 'නියගම මොකද වෙන්නේ?',
    welcome: 'සාදරයෙන් පිළිගනිමු',
    todayIs: 'අද දිනය',
    logInTime: 'ඇතුළු වූ වේලාව',
    outEligibility: 'පිටවීමේ සුදුසුකම',
    eligibleForDeparture: 'පිටවීමට සුදුසුයි',
    myLeave: 'මගේ නිවාඩු',
    leavesTaken: 'ලබාගත් නිවාඩු',
    leavesRemaining: 'ඉතිරි නිවාඩු',
    shortLeaves: 'කෙටි නිවාඩු',
    commandCenter: 'විධාන මධ්‍යස්ථානය',
    attendance: 'පැමිණීම',
    officialJournal: 'නිල දිනපොත',
    communityPulse: 'ප්‍රජා ස්පන්දනය',
    trendingNow: 'දැන් ප්‍රචලිතයි',
    topContributors: 'ඉහළම දායකයින්',
    polishPost: 'පෝස්ට් එක ඔප දමන්න',
    polishing: 'ඔප දමමින්...',
    broadcast: 'ප්‍රචාරය කරන්න',
    loading: 'පූරණය වෙමින්...',
    saveOfficer: 'නිලධාරියා සුරකින්න',
    manageStaff: 'කාර්ය මණ්ඩල කළමනාකරණය',
    addOfficer: 'නිලධාරියෙකු එක් කරන්න',
    editOfficer: 'නිලධාරියා සංස්කරණය කරන්න'
  }
};
