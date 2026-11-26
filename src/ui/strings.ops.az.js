// Strings of the turnaround functions. Azerbaijani. Machine-translated with DeepL (Free) and lightly corrected: needs a native review.
export const OPS_AZ = {
  tabs: { turn: 'Uçuş', delays: 'Gecikmələr', special: 'Xüsusi yük', ready: 'Hazırlıq', overview: 'Növbə', delaysmgr: 'Gecikmələr', handover: 'Təhvil' },
  role: { title: 'Rol', sv: 'Supervayzer', lm: 'Loadmaster', ch: 'Növbə rəisi', hint: 'Rol yalnız sekmələr dəstini dəyişir. Məlumat eyni qalır.', header: { sv: 'Supervayzer', lm: 'Loadmaster', ch: 'Növbə rəisi' } },
  theme: { title: 'Mövzu', day: 'Gün', night: 'Gecə' },
  net: {
    online: 'Online', offline: 'Offline', queueTitle: 'Sinxronizasiya növbəsi',
    queueText: 'Bütün hərəkətlər bu telefonda yadda saxlanılır və şəbəkəsiz işləyir. Serverə göndərmə növbəti mərhələdə olacaq: hazırda server yoxdur, ona görə də sayğac yalnız artır.',
    count: 'Göndərilməyib: {n}', none: 'Göndərilməmiş hərəkət yoxdur', last: 'Son hərəkətlər', mode: { online: 'Şəbəkə var', offline: 'Şəbəkə yoxdur. İş davam edir' },
  },
  hold: { hint: '1,2 san. saxlayın', swipe: 'Göndərmək üçün sağa sürüşdürün' },
  noFlight: 'Uçuş yoxdur. LIR-i «Uçuşlar» sekməsində açın.',
  svc: { unload: 'Boşaltma', load: 'Yükləmə', fuel: 'Fuel', cater: 'Katerinq', gse: 'GSE / xüsusi texnika' },
  fod: {
    title: 'Təyyarə dayanacağı {stand}: yoxlanış', titleNoStand: 'Təyyarə dayanacağının yoxlanışı (FOD)',
    items: [
      'Təyyarə dayanacağı yad cisimlərdən (FOD) azaddır', 'Çəpərlər və konuslar quraşdırılıb', 'Təyyarəyə gedən yol açıqdır',
      'Yanacaq və yağ ləkələri yoxdur', 'Xüsusi texnika gözləmə zonasındadır', 'Dayanacağın işıqlandırması işləkdir',
    ],
    tap: 'Basın: OK. Yenə: qeyd. Yenə: sıfırla.', ok: 'OK', note: '!', none: '·', toIncident: 'Hadisə barədə bildirin',
    locked: 'Yoxlama bağlanıb: Chocks artıq quraşdırılıb.',
  },
  chocks: {
    title: 'Chocks', off: 'quraşdırılmayıb', onAt: 'ON {time}', offAt: 'OFF {time}',
    btnOn: 'Chocks ON', btnOff: 'Chocks OFF', needFod: 'Əvvəlcə dayanacaq yoxlanışını tamamlayın', needReady: 'Loadmaster-in hazırlıq təsdiqi gözlənilir',
  },
  timers: {
    title: 'Xidmət taymerləri', plan: 'Plan {n} dəq', startAt: 'start {time}', start: 'Start', stop: 'Dayan', doneAt: 'Tamamlandı {time}',
    needChocks: 'Taymerlər Chocks ON-dan sonra mövcuddur.', loadLink: 'Yükləmə «Yükləmə» sekməsində aparılır', openLoad: '«Yükləmə» sekməsini aç',
  },
  delay: {
    title: 'Gecikmə / hadisə', editTitle: 'Kodu dəyişin', search: 'Axtarış: kod və ya söz', minutes: 'Müddət, dəq', photo: 'Foto', photos: 'Foto: {n}',
    note: 'Qeyd', save: 'Yadda saxla', saveCode: 'Kodu saxla', other: 'Digər kod: {code}', noCode: 'Kodu seçin', none: 'Uçuş üzrə gecikmə yoxdur', newBtn: 'Gecikmə / hadisə',
    by: 'Supervayzer', details: '{code} · {min} dəq', photoCount: 'foto: {n}', empty: 'Kod tapılmadı. İki rəqəm daxil edin.',
    status: { PENDING: 'Qərar gözlənilir', APPROVED: 'Təsdiq olundu', ESCALATED: 'Yüksək səlahiyyətli orqana göndərildi', RETURNED: 'Göndərənə qaytarıldı' },
    groups: { cargo: 'Yük və sənədlər', load: 'Yükləmə', service: 'Xidmət', other: 'Digər' },
    codes: {
      '31': ['Gec təqdim edilmiş və ya yanlışlıqlar ehtiva edən sənədlər', 'cargo'], '32': ['Yükləmə / boşaltma', 'cargo'], '33': ['Yükləmə avadanlığının çatışmazlığı və ya sıradan çıxması', 'load'],
      '38': ['ULD çatışmazlığı', 'load'], '34': ['Təyyarə texniki qulluq avadanlığı', 'service'], '36': ['Yanacağın doldurulması / boşaldılması', 'service'], '37': ['Katerinq', 'service'],
      '39': ['Apronda yer dəstəyi avadanlığı (GSE)', 'service'], '51': ['Yerüstü əməliyyatlar zamanı yaranan zərər', 'other'], '71': ['Uçuş limanında hava şəraiti', 'other'], '93': ['Təyyarə rotasiyası', 'other'],
    },
    decide: { title: '{no} · kod {code}', approve: 'Təsdiq et', changeCode: 'Kodu dəyiş', ret: 'Göndərənə qaytar', escalate: 'Yuxarı instansiyaya ötür', history: 'Kod {from} idi, {to} oldu' },
  },
  special: {
    title: '{no} uçuşunun xüsusi yükü', DGR: 'Təhlükəli yük', AVI: 'Canlı heyvanlar', PER: 'Tez xarab olan', HEA: 'Ağır yük', none: 'Xüsusi yük yoxdur. LIR-də işarələyin: ULD üzərinə basın.',
    onUld: 'Bu ULD-də xüsusi yük', hint: 'DGR, AVI, PER, HEA yoxlanışı bərkitmə çek-listinə daxildir.', readOnly: 'Bu işarəni Loadmaster qoyur',
  },
  lm: {
    title: 'Kilidlər və bərkitmələr',
    items: [
      'Main Deck-in bütün mövqelərində kilidlər bağlıdır', 'Bərkidici qayışlar və torlar quraşdırılıb', 'Bariyer toru quraşdırılıb', 'Yan dayaqlar və məhdudlaşdırıcılar',
      'Aşağı göyərtə: kilidlər və dayaqlar', 'DGR: istiqamətləndirmə və ayrı saxlama', 'AVI / PER: yerləşdirmə və şərtlər', 'HEA: yükün bölgüsü',
    ],
    tap: 'Basın: OK. Yenə: qeyd. Yenə: sıfırla.', locked: 'Təyyarə uçub. Çek-list bağlanıb.',
  },
  ready: {
    title: '{no} yükləməsinin hazırlığı', confirmed: 'Təsdiqləndi {time}', not: 'təsdiqlənməyib', counts: 'ULD: {n}', blockers: 'Təsdiqə mane olanlar:', allOk: 'Hamısı yoxlanılıb. Təsdiq etmək olar.',
    btn: 'Yükləməyə hazırlığı təsdiqlə', revoke: 'Hazırlıq təsdiqini götür', fixFirst: 'Əvvəlcə yuxarıdakı maddələri bağlayın',
    issue: { NO_ULD: 'LIR-də heç bir ULD qeyd olunmayıb', LM: 'Çek-list: {item}', LM_NOTE: 'Qeyd: {item}', DGR: 'Göydə DGR var: istiqamətləndirmə və ayrı saxlama yoxlanışı tələb olunur' },
    note: 'Tətbiq ULD uçotu aparmır və yekun aktı imzalamır. Bunu səlahiyyətli işçi heyəti edir.',
  },
  ch: {
    kpi: { flights: 'növbədə uçuş', ok: 'qrafikdə', warn: 'risk altında', late: 'gecikir', done: 'uçdu', open: 'qərar gözləyən gecikmə', dgr: 'DGR mövqeyi' },
    table: { flight: 'Uçuş', stand: 'Dayanacaq', status: 'Status', sla: 'SLA', std: 'STD', chocks: 'Chocks', ready: 'Hazır', uld: 'ULD' },
    st: { planned: 'Gözləyir', chocks: 'Chocks ON', service: 'Xidmət', ready: 'Uçuşa hazırdır', departed: 'Uçdu' },
    why: {
      OK: 'Qrafikdə', DONE: 'Tamamlandı', TIMER_LATE: 'Plan vaxtı aşılıb: {name}', TIMER_WARN: 'Plana yaxın: {name}', DELAY_OPEN: 'Gecikmə qərar gözləyir',
      STD_10: 'STD-yə 10 dəqiqədən az qalıb', STD_30: 'STD-yə 30 dəqiqədən az qalıb',
    },
    timeline: 'Növbənin gedişi', dayShift: 'Növbə · {date}', detail: { timers: 'Xidmət taymerləri', loading: 'Yükləmə', delays: 'Gecikmələr', none: 'Yoxdur', ulds: 'ULD: {n}', special: 'Xüsusi yüklər', ready: 'Hazırlıq' },
    delaysTitle: 'Növbənin gecikmələri', delayCols: { flight: 'Uçuş', code: 'Kod', min: 'Dəq', why: 'Səbəb və qeyd', by: 'İcraçı', status: 'Status' }, waiting: 'Qərar gözləyir: {n}',
  },
  handover: {
    title: 'Növbə təhvili', draft: 'Qaralama', sent: 'Göndərildi', flights: 'Uçuşlar', delays: 'Gecikmələr: {n}, cəmi {min} dəq', open: 'Növbəti növbə üçün açıq məsələlər', specials: 'Xüsusi yüklər',
    comment: 'Növbə rəisinin şərhi', sentAt: '{time} saatında göndərilib. Qəbul edən: növbəti növbə rəisi.', openOk: 'Yoxdur', auto: 'Növbə məlumatlarından avtomatik tərtib olunub',
    openNote: 'Açıq gecikmələrlə göndərmək olar. Onlar «Açıq məsələlər» bölməsinə düşəcək.', openDelay: '{no}: {code} kodu üzrə qərar qəbul edilməyib', openFlight: '{no}: {st}, {why}',
    cols: { flight: 'Uçuş', status: 'Status', on: 'Chocks ON', off: 'Chocks OFF', uld: 'ULD' }, history: 'Əvvəl göndərilənlər', send: 'Göndər',
  },
  toast: {
    fod: 'Dayanacaq yoxlanışı: maddə {n}: {v}', chocksOn: '{no}: Chocks ON {time}', chocksOff: '{no}: Chocks OFF {time}', start: '{svc}: start', stop: '{svc}: dayan',
    delay: '{no}: gecikmə {code}, {min} dəq', decided: '{no}: gecikmə {code}: {v}', special: 'Xüsusi yük {code}: {v}', lm: 'Bərkitmələr: maddə {n}: {v}', ready: '{no}: yükləməyə hazırlıq təsdiqləndi',
    unready: '{no}: təsdiq geri götürüldü', handover: 'Növbə təhvili göndərildi', v: { ok: 'OK', note: 'qeyd', reset: 'sıfırlandı' },
  },
  log: {
    FOD_SET: 'Dayanacaq yoxlanışı, maddə {n}: {v}', CHOCKS_ON: 'Chocks ON', CHOCKS_OFF: 'Chocks OFF', SERVICE_STARTED: '{svc}: start', SERVICE_STOPPED: '{svc}: dayan',
    DELAY_REPORTED: 'Gecikmə {code}, {min} dəq', DELAY_DECIDED: 'Gecikmə {code}: {v}', SPECIAL_CARGO_SET: 'Xüsusi yük {code}: {v}', LM_CHECK_SET: 'Bərkitmələr, maddə {n}: {v}',
    READY_CONFIRMED: 'Yükləməyə hazırlıq təsdiqləndi', READY_REVOKED: 'Hazırlıq təsdiqi geri götürüldü', HANDOVER_SENT: 'Növbə təhvili göndərildi',
  },
  err: {
    FOD_INCOMPLETE: 'Əvvəlcə dayanacaq yoxlanışını tamamlayın.', CHOCKS_ALREADY_ON: 'Chocks artıq quraşdırılıb.', CHOCKS_ALREADY_OFF: 'Chocks artıq çıxarılıb.', CHOCKS_NOT_ON: 'Əvvəlcə Chocks ON qoyun.',
    NOT_READY: 'Loadmaster hələ yükləməyə hazırlığı təsdiqləməyib.', ALREADY_STARTED: 'Artıq işə salınıb.', NOT_STARTED: 'Hələ işə salınmayıb.', ALREADY_STOPPED: 'Artıq dayandırılıb.',
    INVALID_CODE: 'Kod iki rəqəmdən ibarətdir.', INVALID_MINUTES: 'Müddət 1-dən 999 dəqiqəyə qədər.', ALREADY_APPROVED: 'Gecikmə artıq təsdiqlənib.', ALREADY_ESCALATED: 'Gecikmə artıq yuxarıya ötürülüb.',
    SAME_CODE: 'Bu eyni koddur.', INVALID_VALUE: 'Yanlış dəyər.', INVALID_ITEM: 'Belə bir maddə yoxdur.', INVALID_SERVICE: 'Belə bir xidmət yoxdur.', READY_BLOCKED: 'Bağlanmamış maddələr var.', ALREADY_READY: 'Hazırlıq artıq təsdiqlənib.',
  },
};
