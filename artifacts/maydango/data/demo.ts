import type { ImageSourcePropType } from 'react-native';

export type CityOption = {
  id: string;
  english: string;
  arabic: string;
  kurdish: string;
  region: string;
};

export const cities: CityOption[] = [
  { id: 'all', english: 'All Iraq', arabic: 'كل العراق', kurdish: 'هەموو عێراق', region: 'Nationwide' },
  { id: 'baghdad', english: 'Baghdad', arabic: 'بغداد', kurdish: 'بەغدا', region: 'Central Iraq' },
  { id: 'basra', english: 'Basra', arabic: 'البصرة', kurdish: 'بەسرە', region: 'Southern Iraq' },
  { id: 'najaf', english: 'Najaf', arabic: 'النجف', kurdish: 'نەجەف', region: 'Central & South' },
  { id: 'mosul', english: 'Mosul', arabic: 'الموصل', kurdish: 'مووسڵ', region: 'Northern Iraq' },
  { id: 'erbil', english: 'Erbil', arabic: 'أربيل', kurdish: 'هەولێر', region: 'Kurdistan Region' },
  { id: 'sulaymaniyah', english: 'Sulaymaniyah', arabic: 'السليمانية', kurdish: 'سلێمانی', region: 'Kurdistan Region' },
  { id: 'duhok', english: 'Duhok', arabic: 'دهوك', kurdish: 'دهۆک', region: 'Kurdistan Region' },
  { id: 'ramadi', english: 'Ramadi', arabic: 'الرمادي', kurdish: 'ڕەمادی', region: 'Western Iraq' },
];

export function getCityLabel(cityId: string, language: 'en' | 'ar' | 'ku') {
  const city = cities.find((item) => item.id === cityId);
  if (!city) return cities[1].english;
  return language === 'ar' ? city.arabic : language === 'ku' ? city.kurdish : city.english;
}

export type Facility = {
  id: string;
  name: string;
  category: string;
  cityId: string;
  district: string;
  city: string;
  rating: string;
  reviews: number;
  distance: string;
  gender: string;
  openUntil: string;
  description: string;
  image: ImageSourcePropType;
  latitude: number;
  longitude: number;
  activities: string[];
  mapPosition: { x: number; y: number };
};

export type TrainingSession = {
  id: string;
  facilityId?: string;
  mode?: 'in-person' | 'online';
  title: string;
  instructor: string;
  time: string;
  duration: string;
  remaining: number;
  level: string;
  gender: string;
  image: ImageSourcePropType;
};

export type Course = {
  id: string;
  title: string;
  instructor: string;
  lessons: number;
  duration: string;
  level: string;
  progress: number;
  image: ImageSourcePropType;
};

export type CommunityEvent = {
  id: string;
  title: string;
  cityId: string;
  city: string;
  venue: string;
  date: string;
  access: string;
  description: string;
  image: ImageSourcePropType;
};

export type Coach = {
  id: string;
  name: string;
  specialty: string;
  languages: string;
  availability: string;
  image: ImageSourcePropType;
};

export const facilities: Facility[] = [
  {
    id: 'rise-studio',
    name: 'Rise Movement Studio',
    category: 'Strength · Pilates',
    cityId: 'baghdad',
    district: 'Al-Mansour',
    city: 'Baghdad',
    rating: '4.9',
    reviews: 128,
    distance: '1.2 km',
    gender: 'Women-only hours',
    openUntil: 'Open until 10 pm',
    description:
      'A bright, coach-led studio for strength, reformer Pilates and mindful movement. New members are welcome at every level.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 33.3152,
    longitude: 44.3661,
    activities: ['Strength', 'Pilates', 'Mobility'],
    mapPosition: { x: 28, y: 36 },
  },
  {
    id: 'padel-house',
    name: 'Padel House Baghdad',
    category: 'Padel · Racket sports',
    cityId: 'baghdad',
    district: 'Karrada',
    city: 'Baghdad',
    rating: '4.8',
    reviews: 96,
    distance: '2.4 km',
    gender: 'Mixed sessions',
    openUntil: 'Open until 11 pm',
    description:
      'Two panoramic courts, racket hire and welcoming group games for first-timers and experienced players.',
    image: require('../assets/images/maydango-padel.jpg'),
    latitude: 33.3129,
    longitude: 44.4217,
    activities: ['Padel', 'Social sport', 'Coaching'],
    mapPosition: { x: 70, y: 44 },
  },
  {
    id: 'olive-room',
    name: 'The Olive Room',
    category: 'Yoga · Recovery',
    cityId: 'baghdad',
    district: 'Zayouna',
    city: 'Baghdad',
    rating: '4.9',
    reviews: 74,
    distance: '3.1 km',
    gender: 'Women-only sessions',
    openUntil: 'Open until 9 pm',
    description:
      'Slow yoga, mobility and thoughtful recovery sessions in a calm neighborhood space.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 33.3262,
    longitude: 44.4338,
    activities: ['Yoga', 'Recovery', 'Mobility'],
    mapPosition: { x: 78, y: 24 },
  },
  {
    id: 'babylon-aquatics',
    name: 'Babylon Aquatics',
    category: 'Swimming · Family',
    cityId: 'baghdad',
    district: 'Al-Jadriya',
    city: 'Baghdad',
    rating: '4.7',
    reviews: 61,
    distance: '4.6 km',
    gender: 'Family hours',
    openUntil: 'Open until 8 pm',
    description:
      'A well-kept pool for lap swimming, beginner lessons and family-friendly open hours.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 33.2764,
    longitude: 44.3799,
    activities: ['Swimming', 'Family', 'Lessons'],
    mapPosition: { x: 45, y: 76 },
  },
  {
    id: 'citadel-movement',
    name: 'Citadel Movement Club',
    category: 'Strength · Boxing',
    cityId: 'erbil',
    district: 'Ankawa',
    city: 'Erbil',
    rating: '4.9',
    reviews: 83,
    distance: '1.5 km',
    gender: 'Women-only sessions',
    openUntil: 'Open until 10 pm',
    description:
      'Small-group strength and boxing classes with clear coaching, flexible session times and a friendly first-visit welcome.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 36.1912,
    longitude: 44.0092,
    activities: ['Strength', 'Boxing', 'Mobility'],
    mapPosition: { x: 32, y: 35 },
  },
  {
    id: 'slemani-yoga-house',
    name: 'Slemani Yoga House',
    category: 'Yoga · Pilates',
    cityId: 'sulaymaniyah',
    district: 'Bakhtiary',
    city: 'Sulaymaniyah',
    rating: '4.8',
    reviews: 67,
    distance: '1.1 km',
    gender: 'Women-only sessions',
    openUntil: 'Open until 9 pm',
    description:
      'A calm studio for yoga, Pilates and mindful movement, with classes for new and experienced members.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 35.5578,
    longitude: 45.4351,
    activities: ['Yoga', 'Pilates', 'Mobility'],
    mapPosition: { x: 70, y: 45 },
  },
  {
    id: 'duhok-active',
    name: 'Duhok Active Studio',
    category: 'Strength · Fitness',
    cityId: 'duhok',
    district: 'Duhok Centre',
    city: 'Duhok',
    rating: '4.7',
    reviews: 42,
    distance: '1.8 km',
    gender: 'Mixed sessions',
    openUntil: 'Open until 9 pm',
    description:
      'Coach-led training, open gym access and approachable sessions for every starting point.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 36.8615,
    longitude: 42.9875,
    activities: ['Strength', 'Fitness', 'Coaching'],
    mapPosition: { x: 46, y: 27 },
  },
  {
    id: 'tigris-wellness',
    name: 'Tigris Wellness Club',
    category: 'Swimming · Recovery',
    cityId: 'mosul',
    district: 'Al-Majmoua',
    city: 'Mosul',
    rating: '4.8',
    reviews: 52,
    distance: '2.0 km',
    gender: 'Family hours',
    openUntil: 'Open until 8 pm',
    description:
      'Pool sessions, mobility classes and guided recovery in a welcoming local club.',
    image: require('../assets/images/maydango-yoga.jpg'),
    latitude: 36.357,
    longitude: 43.142,
    activities: ['Swimming', 'Recovery', 'Family'],
    mapPosition: { x: 59, y: 48 },
  },
  {
    id: 'basra-palm-courts',
    name: 'Palm Courts Basra',
    category: 'Padel · Social sport',
    cityId: 'basra',
    district: 'Al-Ashar',
    city: 'Basra',
    rating: '4.9',
    reviews: 58,
    distance: '1.4 km',
    gender: 'Mixed sessions',
    openUntil: 'Open until 11 pm',
    description:
      'Friendly padel sessions and coached court time, with equipment available to borrow.',
    image: require('../assets/images/maydango-padel.jpg'),
    latitude: 30.5085,
    longitude: 47.7804,
    activities: ['Padel', 'Social sport', 'Coaching'],
    mapPosition: { x: 68, y: 62 },
  },
  {
    id: 'anbar-training-yard',
    name: 'Anbar Training Yard',
    category: 'Football · Strength',
    cityId: 'ramadi',
    district: 'Ramadi Centre',
    city: 'Ramadi',
    rating: '4.7',
    reviews: 39,
    distance: '2.3 km',
    gender: 'Men-only sessions',
    openUntil: 'Open until 10 pm',
    description:
      'Team sports, conditioning and practical strength training in a relaxed neighborhood setting.',
    image: require('../assets/images/maydango-padel.jpg'),
    latitude: 33.423,
    longitude: 43.305,
    activities: ['Football', 'Strength', 'Social sport'],
    mapPosition: { x: 38, y: 66 },
  },
  {
    id: 'najaf-strength-club',
    name: 'Najaf Strength Club',
    category: 'Strength · Fitness',
    cityId: 'najaf',
    district: 'Al-Amir',
    city: 'Najaf',
    rating: '4.8',
    reviews: 47,
    distance: '1.7 km',
    gender: 'Women-only hours',
    openUntil: 'Open until 9 pm',
    description:
      'A supportive place to build strength at your own pace, with women-only hours and guided sessions.',
    image: require('../assets/images/maydango-strength.jpg'),
    latitude: 32.0004,
    longitude: 44.3358,
    activities: ['Strength', 'Fitness', 'Coaching'],
    mapPosition: { x: 52, y: 71 },
  },
];

export const sessions: TrainingSession[] = [
  {
    id: 'rise-strength-1',
    facilityId: 'rise-studio',
    title: 'Full-body strength',
    instructor: 'Dina Kareem',
    time: 'Today · 6:30 PM',
    duration: '50 min',
    remaining: 4,
    level: 'All levels',
    gender: 'Women-only',
    image: require('../assets/images/maydango-strength.jpg'),
  },
  {
    id: 'olive-flow-1',
    facilityId: 'olive-room',
    title: 'Evening unwind yoga',
    instructor: 'Noor Ahmed',
    time: 'Today · 7:15 PM',
    duration: '45 min',
    remaining: 7,
    level: 'Beginner friendly',
    gender: 'Women-only',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'padel-open-1',
    facilityId: 'padel-house',
    title: 'Padel social: open play',
    instructor: 'Omar Saeed',
    time: 'Tomorrow · 5:00 PM',
    duration: '60 min',
    remaining: 2,
    level: 'Intermediate',
    gender: 'Mixed',
    image: require('../assets/images/maydango-padel.jpg'),
  },
  {
    id: 'erbil-strength-1',
    facilityId: 'citadel-movement',
    title: 'Strength, your way',
    instructor: 'Rojin Hassan',
    time: 'Today · 6:00 PM',
    duration: '45 min',
    remaining: 5,
    level: 'All levels',
    gender: 'Women-only',
    image: require('../assets/images/maydango-strength.jpg'),
  },
  {
    id: 'slemani-flow-1',
    facilityId: 'slemani-yoga-house',
    title: 'Grounded flow',
    instructor: 'Hana Mahmood',
    time: 'Today · 6:45 PM',
    duration: '50 min',
    remaining: 6,
    level: 'All levels',
    gender: 'Women-only',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'basra-padel-1',
    facilityId: 'basra-palm-courts',
    title: 'Padel open play',
    instructor: 'Mustafa Nouri',
    time: 'Tomorrow · 5:30 PM',
    duration: '60 min',
    remaining: 3,
    level: 'Beginner friendly',
    gender: 'Mixed',
    image: require('../assets/images/maydango-padel.jpg'),
  },
  {
    id: 'mosul-mobility-1',
    facilityId: 'tigris-wellness',
    title: 'Everyday mobility',
    instructor: 'Layla Abdulrahman',
    time: 'Tomorrow · 7:00 PM',
    duration: '40 min',
    remaining: 8,
    level: 'Beginner friendly',
    gender: 'Family',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'online-mobility-1',
    mode: 'online',
    title: 'Mobility from home',
    instructor: 'Noor Ahmed',
    time: 'Today · 8:00 PM',
    duration: '30 min',
    remaining: 18,
    level: 'All levels',
    gender: 'Open to all',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'online-strength-1',
    mode: 'online',
    title: 'Strong at home',
    instructor: 'Rojin Hassan',
    time: 'Tomorrow · 6:30 PM',
    duration: '35 min',
    remaining: 12,
    level: 'Beginner friendly',
    gender: 'Open to all',
    image: require('../assets/images/maydango-strength.jpg'),
  },
];

export const communityEvents: CommunityEvent[] = [
  {
    id: 'move-together-erbil',
    title: 'Move Together Weekend',
    cityId: 'erbil',
    city: 'Erbil',
    venue: 'Erbil community sports park',
    date: 'Saturday · 10:00 AM',
    access: 'All ages · all levels',
    description: 'A relaxed day of beginner-friendly movement, games and time together.',
    image: require('../assets/images/maydango-strength.jpg'),
  },
  {
    id: 'riverfront-basra',
    title: 'Basra Wellness by the River',
    cityId: 'basra',
    city: 'Basra',
    venue: 'Ashar riverside event area',
    date: 'Friday · 4:30 PM',
    access: 'Families welcome',
    description: 'Easy outdoor movement, community activities and a welcoming space to take part at your own pace.',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'community-games-baghdad',
    title: 'Baghdad Community Games',
    cityId: 'baghdad',
    city: 'Baghdad',
    venue: 'Al-Mansour sports grounds',
    date: 'Thursday · 5:00 PM',
    access: 'All levels',
    description: 'Try short, friendly games and meet local clubs in a no-pressure community setting.',
    image: require('../assets/images/maydango-padel.jpg'),
  },
];

export const coaches: Coach[] = [
  {
    id: 'coach-noor',
    name: 'Noor Ahmed',
    specialty: 'Mobility · yoga · getting started',
    languages: 'Arabic · English',
    availability: 'Today · 7:00 PM',
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'coach-rojin',
    name: 'Rojin Hassan',
    specialty: 'Strength · movement confidence',
    languages: 'Kurdish · Arabic · English',
    availability: 'Tomorrow · 11:00 AM',
    image: require('../assets/images/maydango-strength.jpg'),
  },
  {
    id: 'coach-omar',
    name: 'Omar Saeed',
    specialty: 'Fitness · padel conditioning',
    languages: 'Arabic · Kurdish',
    availability: 'Tomorrow · 6:30 PM',
    image: require('../assets/images/maydango-padel.jpg'),
  },
];

export const courses: Course[] = [
  {
    id: 'move-at-home',
    title: 'Move well at home',
    instructor: 'Noor Ahmed',
    lessons: 8,
    duration: '2 hr 10 min',
    level: 'Beginner',
    progress: 38,
    image: require('../assets/images/maydango-yoga.jpg'),
  },
  {
    id: 'strong-foundations',
    title: 'Strong foundations',
    instructor: 'Dina Kareem',
    lessons: 10,
    duration: '3 hr 20 min',
    level: 'All levels',
    progress: 0,
    image: require('../assets/images/maydango-strength.jpg'),
  },
];

export const categories = [
  'All',
  'Strength',
  'Yoga',
  'Padel',
  'Swimming',
  'Pilates',
  'Wellness',
];
