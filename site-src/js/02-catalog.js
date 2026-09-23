/* ==========================================================================
   Каталог демо: отели, самолёты, вертолёты, координаты.
   Всё здесь — тестовые данные. Названия отелей вымышлены намеренно: реальные
   создавали бы впечатление подписанных договоров с этими отелями.
   ========================================================================== */
"use strict";

/* Координаты — для оценки времени полёта частного борта (по дуге большого круга). */
const COORDS = {
  TAS:[41.2579,69.2812], SKD:[39.7005,66.9838], BHK:[39.7750,64.4833], UGC:[41.5843,60.6417],
  FEG:[40.3588,71.7450], NMA:[40.9846,71.5567], AZN:[40.7277,72.2940], NCU:[42.4884,59.6233],
  TMJ:[37.2867,67.3100], KSQ:[38.8336,65.9215], IST:[41.2753,28.7519], DXB:[25.2528,55.3644],
  AYT:[36.8987,30.8005], SHJ:[25.3286,55.5172], JED:[21.6796,39.1565], SSH:[27.9773,34.3950],
  CXR:[11.9982,109.2194], HKT:[8.1132,98.3169], DAD:[16.0439,108.1994], DME:[55.4088,37.9063],
  LED:[59.8003,30.2625], ICN:[37.4602,126.4407], BKK:[13.6900,100.7501], DEL:[28.5562,77.1000],
  IKA:[35.4161,51.1522], FRA:[50.0379,8.5622], KUL:[2.7456,101.7072], PEK:[40.0799,116.6031],
  ALA:[43.3521,77.0405]
};
function distanceKm(a, b){
  const [la1,lo1]=a, [la2,lo2]=b, r=Math.PI/180;
  const h=Math.sin((la2-la1)*r/2)**2 + Math.cos(la1*r)*Math.cos(la2*r)*Math.sin((lo2-lo1)*r/2)**2;
  return 2*6371*Math.asin(Math.sqrt(h));
}

/* Курортные направления: и туры, и отели. Палитра — «открытка» направления,
   одинаковая в светлой и тёмной теме, текст на ней всегда белый. */
const RESORTS = ["AYT","DXB","IST","SSH","CXR","HKT"];
const PALETTE = {
  AYT:["#0FA3B1","#1E5FD0"], DXB:["#D99A3E","#8C4A22"], IST:["#3B4FC4","#1B2463"],
  SSH:["#E15B4B","#8E2F5C"], CXR:["#13A376","#136C9E"], HKT:["#0E8F6E","#C98A1E"]
};
/* Высокий сезон по месяцам — цена отеля в эти месяцы выше. */
const HIGH_SEASON = { AYT:[6,7,8], IST:[5,6,9], DXB:[12,1,2,3], SSH:[10,11,12,1], CXR:[1,2,3,4], HKT:[12,1,2] };

/* Типы питания — стандартные коды турбизнеса. */
const BOARDS = ["RO","BB","HB","AI","UAI"];

/* base — цена номера за ночь в USD для двоих, уже с наценкой. */
const HOTELS = [
  { id:"ayt-lara",   city:"AYT", name:"Lara Sun Resort",        stars:5, area:"Lara",         board:"UAI", base:228, rating:9.1, beach:40,   am:["beach","pool","spa","kids","wifi"] },
  { id:"ayt-belek",  city:"AYT", name:"Belek Grand Palace",     stars:5, area:"Belek",        board:"UAI", base:262, rating:9.3, beach:120,  am:["beach","pool","spa","golf","kids","wifi"] },
  { id:"ayt-kemer",  city:"AYT", name:"Kemer Pine Garden",      stars:4, area:"Kemer",        board:"AI",  base:132, rating:8.6, beach:250,  am:["beach","pool","kids","wifi"] },
  { id:"ayt-konya",  city:"AYT", name:"Konyaaltı Blue Coast",   stars:4, area:"Konyaaltı",    board:"AI",  base:118, rating:8.4, beach:180,  am:["beach","pool","wifi"] },
  { id:"ayt-kale",   city:"AYT", name:"Old Town Harbour Hotel", stars:3, area:"Kaleiçi",      board:"BB",  base:58,  rating:8.2, beach:900,  am:["wifi"] },

  { id:"dxb-desert", city:"DXB", name:"Desert Rose Beach Resort", stars:5, area:"JBR",        board:"HB",  base:246, rating:9.0, beach:30,   am:["beach","pool","spa","wifi"] },
  { id:"dxb-pearl",  city:"DXB", name:"Downtown Pearl Hotel",   stars:5, area:"Downtown",     board:"BB",  base:214, rating:9.2, beach:null, am:["pool","spa","wifi"] },
  { id:"dxb-marina", city:"DXB", name:"Marina Skyline Hotel",   stars:4, area:"Dubai Marina", board:"BB",  base:128, rating:8.7, beach:600,  am:["pool","wifi"] },
  { id:"dxb-creek",  city:"DXB", name:"Deira Creek Inn",        stars:3, area:"Deira",        board:"BB",  base:68,  rating:8.1, beach:null, am:["wifi"] },

  { id:"ist-metro",  city:"IST", name:"Taksim Metropol",        stars:5, area:"Taksim",       board:"BB",  base:188, rating:8.9, beach:null, am:["spa","wifi"] },
  { id:"ist-bosph",  city:"IST", name:"Bosphorus View Hotel",   stars:4, area:"Beşiktaş",     board:"BB",  base:112, rating:8.8, beach:null, am:["wifi"] },
  { id:"ist-galata", city:"IST", name:"Galata Loft Suites",     stars:4, area:"Galata",       board:"RO",  base:96,  rating:8.6, beach:null, am:["wifi"] },
  { id:"ist-walls",  city:"IST", name:"Sultanahmet Old Walls",  stars:3, area:"Sultanahmet",  board:"BB",  base:64,  rating:8.3, beach:null, am:["wifi"] },

  { id:"ssh-reef",   city:"SSH", name:"Red Sea Reef Resort",    stars:5, area:"Nabq Bay",     board:"UAI", base:168, rating:9.0, beach:20,   am:["beach","pool","spa","kids","wifi"] },
  { id:"ssh-coral",  city:"SSH", name:"Naama Coral Bay",        stars:4, area:"Naama Bay",    board:"AI",  base:96,  rating:8.5, beach:150,  am:["beach","pool","wifi"] },
  { id:"ssh-garden", city:"SSH", name:"Sharks Bay Garden",      stars:3, area:"Sharks Bay",   board:"AI",  base:61,  rating:8.0, beach:400,  am:["pool","wifi"] },

  { id:"cxr-lagoon", city:"CXR", name:"Cam Ranh Lagoon Resort", stars:5, area:"Cam Ranh",     board:"HB",  base:152, rating:9.1, beach:10,   am:["beach","pool","spa","kids","wifi"] },
  { id:"cxr-island", city:"CXR", name:"Hon Tre Island Villas",  stars:5, area:"Hon Tre",      board:"AI",  base:184, rating:9.2, beach:15,   am:["beach","pool","spa","wifi"] },
  { id:"cxr-pearl",  city:"CXR", name:"Nha Trang Ocean Pearl",  stars:4, area:"Tran Phu",     board:"BB",  base:72,  rating:8.6, beach:100,  am:["beach","pool","wifi"] },

  { id:"hkt-kata",   city:"HKT", name:"Kata Hills Retreat",     stars:5, area:"Kata",         board:"BB",  base:158, rating:9.0, beach:300,  am:["pool","spa","wifi"] },
  { id:"hkt-karon",  city:"HKT", name:"Karon Palm Resort",      stars:4, area:"Karon",        board:"HB",  base:92,  rating:8.7, beach:120,  am:["beach","pool","kids","wifi"] },
  { id:"hkt-patong", city:"HKT", name:"Patong Sunset Beach",    stars:4, area:"Patong",       board:"BB",  base:84,  rating:8.4, beach:60,   am:["beach","pool","wifi"] },
  { id:"hkt-town",   city:"HKT", name:"Old Phuket Town House",  stars:3, area:"Phuket Town",  board:"RO",  base:46,  rating:8.3, beach:null, am:["wifi"] }
];
const ROOM_TYPES = [
  { id:"standard", mult:1.00, size:24 },
  { id:"deluxe",   mult:1.26, size:32 },
  { id:"family",   mult:1.48, size:45 },
  { id:"suite",    mult:1.92, size:60 }
];

/* Частные самолёты. rate — USD за лётный час, speed — крейсерская, км/ч. */
const JETS = [
  { id:"light",    model:"Cessna Citation CJ3",        seats:6,  rate:3200, speed:720 },
  { id:"mid",      model:"Learjet 60XR",               seats:8,  rate:4300, speed:780 },
  { id:"supermid", model:"Bombardier Challenger 350",  seats:9,  rate:5800, speed:830 },
  { id:"heavy",    model:"Gulfstream G450",            seats:14, rate:8500, speed:850 }
];

/* Вертолёты — вылет с вертолётной площадки в Ташкенте. */
const HELI_BASE = [41.3000, 69.2800];
const HELIS = [
  { id:"r44",  model:"Robinson R44",  seats:3,  rate:900,  speed:180 },
  { id:"h125", model:"Airbus H125",   seats:5,  rate:2600, speed:230 },
  { id:"b407", model:"Bell 407",      seats:6,  rate:2400, speed:240 },
  { id:"mi8",  model:"Mi-8MTV",       seats:18, rate:4500, speed:220 }
];
/* Направления вертолёта. tour — обзорный полёт без посадки, фиксированно 30 минут. */
const HELI_DEST = [
  { id:"chimgan",  coord:[41.5563,70.0180], name:{ ru:"Чимган",  uz:"Chimyon",  en:"Chimgan" } },
  { id:"amirsoy",  coord:[41.4870,70.0550], name:{ ru:"Амирсой", uz:"Amirsoy",  en:"Amirsoy" } },
  { id:"charvak",  coord:[41.6200,69.9500], name:{ ru:"Чарвак",  uz:"Chorvoq",  en:"Charvak" } },
  { id:"zaamin",   coord:[39.6400,68.3900], name:{ ru:"Заамин",  uz:"Zomin",    en:"Zaamin" } },
  { id:"samarkand",coord:[39.7005,66.9838], name:{ ru:"Самарканд", uz:"Samarqand", en:"Samarkand" } },
  { id:"tour",     coord:null, tour:true,   name:{ ru:"Обзорный полёт над Ташкентом", uz:"Toshkent ustidan sayr parvozi", en:"Sightseeing over Tashkent" } }
];
