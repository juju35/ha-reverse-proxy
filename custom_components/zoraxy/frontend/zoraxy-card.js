const ZORAXY_CARD_VERSION = '1.11.8';

// Escapes a value interpolated into innerHTML, as text or inside a quoted attribute (as parcelEsc in ha-parcel).
function zoraxyEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// Only http(s) URLs become links: anything else (javascript:, data:…) is dropped.
function zoraxySafeUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}

class ZoraxyCard extends HTMLElement {

  // ── Statics ────────────────────────────────────────────────────────────────

  static ICONS = {
    router:  "M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76L12.76,4.17C14.71,2.22 17.88,2.22 19.83,4.17C21.78,6.12 21.78,9.29 19.83,11.24L18.29,12.78C18.3,12.03 18.17,11.27 17.89,10.56L18.71,9.76C19.9,8.56 19.9,6.56 18.71,5.36C17.5,4.17 15.5,4.17 14.29,5.36L10.7,8.95C9.5,10.15 9.5,12.15 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24L11.24,19.83C9.29,21.78 6.12,21.78 4.17,19.83C2.22,17.88 2.22,14.71 4.17,12.76L5.71,11.22C5.7,11.97 5.83,12.73 6.11,13.44L5.29,14.24C4.1,15.44 4.1,17.44 5.29,18.64C6.5,19.83 8.5,19.83 9.71,18.64L13.3,15.05C14.5,13.85 14.5,11.85 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z",
    lock:    "M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3M12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17Z",
    web:     "M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
    code:    "M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z",
    cert:    "M13,21L15,20L17,21V14H13M17,9V7H15V9H13V11H15V13H17V11H19V9M11,9H3V11H11M11,13H3V15H11M3,7V9H11V7",
    refresh: "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4",
    server:  "M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M6,3V5H7V3H6M6,11V13H7V11H6M6,19V21H7V19H6Z",
    redirect:"M14,3L17,6H14.5C12,6 10,8 10,10.5V14.5C8.86,14.18 8,13.19 8,12V10.5C8,6.91 10.91,4 14.5,4L17,3.97L14,1M10,21L7,18H9.5C12,18 14,16 14,13.5V9.5C15.14,9.82 16,10.81 16,12V13.5C16,17.09 13.09,20 9.5,20L7,20.03L10,23",
    chevronDown: "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",
    arrowExpand: "M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z",
    arrowCollapse: "M19.5,3.09L15,7.59V4H13V11H20V9H16.41L20.91,4.5L19.5,3.09M4,13V15H7.59L3.09,19.5L4.5,20.91L9,16.41V20H11V13H4Z",
  };

  static LOGO = `<svg class="logo" viewBox="0 0 100 100" role="img" aria-label="Zoraxy">
    <rect width="100" height="100" rx="16" fill="#0f172a"/>
    <circle cx="50" cy="50" r="18" fill="#bfdbfe"/>
    <path d="M50 20 L44 32 L56 32 Z" fill="#bfdbfe"/>
    <path d="M50 80 L44 68 L56 68 Z" fill="#bfdbfe"/>
    <path d="M25 35 Q15 45 15 50 Q15 55 25 65" stroke="#bfdbfe" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M75 35 Q85 45 85 50 Q85 55 75 65" stroke="#bfdbfe" stroke-width="5" fill="none" stroke-linecap="round"/>
  </svg>`;


  static I18N = {
    fr: {
      active: "Actif", inactive: "Inactif",
      rules: "Règles", activeRules: "Actives", certs: "Certs", port: "Port",
      controls: "Contrôles", httpsRedirect: "Redirection HTTPS", port80: "Port 80", devMode: "Mode dev",
      certsSection: "Certificats", proxyRules: "Règles proxy", redirections: "Redirections",
      noCerts: "Aucun certificat trouvé.", noRules: "Aucune règle configurée.", noRedirects: "Aucune redirection configurée.",
      expired: "Expiré", renew: "Renouveler", daysLeft: "J-{n}",
      on: "On", off: "Off",
      enableRule: "Activer", disableRule: "Désactiver",
      ed_zoraxy_url: "URL de Zoraxy", ed_entity_prefix: "Préfixe des entités",
      ed_zoraxy_url_helper: "Ouverte au clic sur le titre de la carte",
      ed_entity_prefix_helper: "Partie commune des entités, par exemple zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Afficher la carte complète", zoomOut: "Revenir à la vue compacte",
      ruleCount: "{a}/{n} règles", certCount: "{n} certs",
      ed_zoom: "Bouton détail", ed_zoom_helper: "Bascule vers la carte complète et revient",
      ed_language: "Langue", lang_auto: "Auto (langue de Home Assistant)",
      unavailable: "Indisponible", cancel: "Annuler",
      confirmPort80Off: "Arrêter l'écoute du port 80 ? Les requêtes HTTP et les challenges ACME HTTP n'atteindront plus Zoraxy.",
      confirmRuleOff: "Désactiver la règle proxy de {domain} ? Le service ne sera plus joignable via Zoraxy.",
    },
    en: {
      active: "Active", inactive: "Inactive",
      rules: "Rules", activeRules: "Active", certs: "Certs", port: "Port",
      controls: "Controls", httpsRedirect: "HTTPS redirect", port80: "Port 80", devMode: "Dev mode",
      certsSection: "Certificates", proxyRules: "Proxy rules", redirections: "Redirections",
      noCerts: "No certificate found.", noRules: "No rule configured.", noRedirects: "No redirect configured.",
      expired: "Expired", renew: "Renew", daysLeft: "{n} d",
      on: "On", off: "Off",
      enableRule: "Enable", disableRule: "Disable",
      ed_zoraxy_url: "Zoraxy URL", ed_entity_prefix: "Entity prefix",
      ed_zoraxy_url_helper: "Opened when clicking the card title",
      ed_entity_prefix_helper: "Common part of the entity IDs, for example zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Show the full card", zoomOut: "Back to the compact view",
      ruleCount: "{a}/{n} rules", certCount: "{n} certs",
      ed_zoom: "Detail button", ed_zoom_helper: "Switches to the full card and back",
      ed_language: "Language", lang_auto: "Auto (Home Assistant language)",
      unavailable: "Unavailable", cancel: "Cancel",
      confirmPort80Off: "Stop listening on port 80? Plain HTTP requests and ACME HTTP challenges will no longer reach Zoraxy.",
      confirmRuleOff: "Disable the proxy rule for {domain}? The service will no longer be reachable through Zoraxy.",
    },
    de: {
      active: "Aktiv", inactive: "Inaktiv",
      rules: "Regeln", activeRules: "Aktiv", certs: "Zert.", port: "Port",
      controls: "Steuerung", httpsRedirect: "HTTPS-Umleitung", port80: "Port 80", devMode: "Dev-Modus",
      certsSection: "Zertifikate", proxyRules: "Proxy-Regeln", redirections: "Weiterleitungen",
      noCerts: "Kein Zertifikat gefunden.", noRules: "Keine Regel konfiguriert.", noRedirects: "Keine Weiterleitung konfiguriert.",
      expired: "Abgelaufen", renew: "Erneuern", daysLeft: "{n} T",
      on: "An", off: "Aus",
      enableRule: "Aktivieren", disableRule: "Deaktivieren",
      ed_zoraxy_url: "Zoraxy-URL", ed_entity_prefix: "Entitätspräfix",
      ed_zoraxy_url_helper: "Wird beim Klick auf den Kartentitel geöffnet",
      ed_entity_prefix_helper: "Gemeinsamer Teil der Entitäts-IDs, zum Beispiel zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Vollständige Karte anzeigen", zoomOut: "Zurück zur kompakten Ansicht",
      ruleCount: "{a}/{n} Regeln", certCount: "{n} Zert.",
      ed_zoom: "Detail-Schaltfläche", ed_zoom_helper: "Wechselt zur vollständigen Karte und zurück",
      ed_language: "Sprache", lang_auto: "Auto (Sprache von Home Assistant)",
      unavailable: "Nicht verfügbar", cancel: "Abbrechen",
      confirmPort80Off: "Port 80 nicht mehr abhören? HTTP-Anfragen und ACME-HTTP-Challenges erreichen Zoraxy dann nicht mehr.",
      confirmRuleOff: "Proxy-Regel für {domain} deaktivieren? Der Dienst ist dann über Zoraxy nicht mehr erreichbar.",
    },
    es: {
      active: "Activo", inactive: "Inactivo",
      rules: "Reglas", activeRules: "Activas", certs: "Cert.", port: "Puerto",
      controls: "Controles", httpsRedirect: "Redirección HTTPS", port80: "Puerto 80", devMode: "Modo dev",
      certsSection: "Certificados", proxyRules: "Reglas de proxy", redirections: "Redirecciones",
      noCerts: "No se encontró ningún certificado.", noRules: "Ninguna regla configurada.", noRedirects: "Ninguna redirección configurada.",
      expired: "Caducado", renew: "Renovar", daysLeft: "{n} d",
      on: "On", off: "Off",
      enableRule: "Activar", disableRule: "Desactivar",
      ed_zoraxy_url: "URL de Zoraxy", ed_entity_prefix: "Prefijo de las entidades",
      ed_zoraxy_url_helper: "Se abre al hacer clic en el título de la tarjeta",
      ed_entity_prefix_helper: "Parte común de los ID de entidad, por ejemplo zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Mostrar la tarjeta completa", zoomOut: "Volver a la vista compacta",
      ruleCount: "{a}/{n} reglas", certCount: "{n} cert.",
      ed_zoom: "Botón de detalle", ed_zoom_helper: "Cambia a la tarjeta completa y vuelve",
      ed_language: "Idioma", lang_auto: "Auto (idioma de Home Assistant)",
      unavailable: "No disponible", cancel: "Cancelar",
      confirmPort80Off: "¿Dejar de escuchar en el puerto 80? Las peticiones HTTP y los desafíos ACME HTTP ya no llegarán a Zoraxy.",
      confirmRuleOff: "¿Desactivar la regla de proxy de {domain}? El servicio dejará de ser accesible a través de Zoraxy.",
    },
    sr: {
      active: "Активан", inactive: "Неактиван",
      rules: "Правила", activeRules: "Активна", certs: "Серт.", port: "Порт",
      controls: "Контроле", httpsRedirect: "HTTPS преусме\u00adравање", port80: "Порт 80", devMode: "Развојни режим",
      certsSection: "Сертификати", proxyRules: "Прокси правила", redirections: "Преусмеравања",
      noCerts: "Није пронађен ниједан сертификат.", noRules: "Ниједно правило није подешено.", noRedirects: "Ниједно преусмеравање није подешено.",
      expired: "Истекао", renew: "Обнови", daysLeft: "{n} д",
      on: "Укљ.", off: "Искљ.",
      enableRule: "Омогући", disableRule: "Онемогући",
      ed_zoraxy_url: "URL адреса за Zoraxy", ed_entity_prefix: "Префикс ентитета",
      ed_zoraxy_url_helper: "Отвара се кликом на наслов картице",
      ed_entity_prefix_helper: "Заједнички део идентификатора ентитета, на пример zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Прикажи целу картицу", zoomOut: "Назад на компактни приказ",
      ruleCount: "Правила: {a}/{n}", certCount: "Серт.: {n}",
      ed_zoom: "Дугме за детаље", ed_zoom_helper: "Пребацује картицу на пун приказ и назад",
      ed_language: "Језик", lang_auto: "Аутоматски (језик Home Assistant-а)",
      unavailable: "Недоступно", cancel: "Откажи",
      confirmPort80Off: "Престати са ослушкивањем порта 80? HTTP захтеви и ACME HTTP провере више неће стизати до Zoraxy-ја.",
      confirmRuleOff: "Онемогућити прокси правило за {domain}? Услуга више неће бити доступна преко Zoraxy-ја.",
    },
    "sr-Latn": {
      active: "Aktivan", inactive: "Neaktivan",
      rules: "Pravila", activeRules: "Aktivna", certs: "Sert.", port: "Port",
      controls: "Kontrole", httpsRedirect: "HTTPS preusme\u00adravanje", port80: "Port 80", devMode: "Razvojni režim",
      certsSection: "Sertifikati", proxyRules: "Proksi pravila", redirections: "Preusmeravanja",
      noCerts: "Nije pronađen nijedan sertifikat.", noRules: "Nijedno pravilo nije podešeno.", noRedirects: "Nijedno preusmeravanje nije podešeno.",
      expired: "Istekao", renew: "Obnovi", daysLeft: "{n} d",
      on: "Uklj.", off: "Isklj.",
      enableRule: "Omogući", disableRule: "Onemogući",
      ed_zoraxy_url: "URL adresa za Zoraxy", ed_entity_prefix: "Prefiks entiteta",
      ed_zoraxy_url_helper: "Otvara se klikom na naslov kartice",
      ed_entity_prefix_helper: "Zajednički deo identifikatora entiteta, na primer zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Prikaži celu karticu", zoomOut: "Nazad na kompaktni prikaz",
      ruleCount: "Pravila: {a}/{n}", certCount: "Sert.: {n}",
      ed_zoom: "Dugme za detalje", ed_zoom_helper: "Prebacuje karticu na pun prikaz i nazad",
      ed_language: "Jezik", lang_auto: "Automatski (jezik Home Assistant-a)",
      unavailable: "Nedostupno", cancel: "Otkaži",
      confirmPort80Off: "Prestati sa osluškivanjem porta 80? HTTP zahtevi i ACME HTTP provere više neće stizati do Zoraxy-ja.",
      confirmRuleOff: "Onemogućiti proksi pravilo za {domain}? Usluga više neće biti dostupna preko Zoraxy-ja.",
    },
    it: {
      active: "Attivo", inactive: "Inattivo",
      rules: "Regole", activeRules: "Attive", certs: "Cert.", port: "Porta",
      controls: "Controlli", httpsRedirect: "Reindiriz\u00adzamento HTTPS", port80: "Porta 80", devMode: "Modalità dev",
      certsSection: "Certificati", proxyRules: "Regole proxy", redirections: "Reindirizzamenti",
      noCerts: "Nessun certificato trovato.", noRules: "Nessuna regola configurata.", noRedirects: "Nessun reindirizzamento configurato.",
      expired: "Scaduto", renew: "Rinnova", daysLeft: "{n} g",
      on: "On", off: "Off",
      enableRule: "Abilita", disableRule: "Disabilita",
      ed_zoraxy_url: "URL di Zoraxy", ed_entity_prefix: "Prefisso delle entità",
      ed_zoraxy_url_helper: "Aperto facendo clic sul titolo della scheda",
      ed_entity_prefix_helper: "Parte comune degli ID entità, ad esempio zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Mostra la scheda completa", zoomOut: "Torna alla vista compatta",
      ruleCount: "Regole: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Pulsante dettagli", ed_zoom_helper: "Passa alla scheda completa e ritorna",
      ed_language: "Lingua", lang_auto: "Auto (lingua di Home Assistant)",
      unavailable: "Non disponibile", cancel: "Annulla",
      confirmPort80Off: "Smettere di ascoltare sulla porta 80? Le richieste HTTP e le verifiche ACME HTTP non raggiungeranno più Zoraxy.",
      confirmRuleOff: "Disabilitare la regola proxy di {domain}? Il servizio non sarà più raggiungibile tramite Zoraxy.",
    },
    nl: {
      active: "Actief", inactive: "Inactief",
      rules: "Regels", activeRules: "Actief", certs: "Cert.", port: "Poort",
      controls: "Bediening", httpsRedirect: "HTTPS-omleiding", port80: "Poort 80", devMode: "Dev-modus",
      certsSection: "Certificaten", proxyRules: "Proxyregels", redirections: "Omleidingen",
      noCerts: "Geen certificaat gevonden.", noRules: "Geen regel geconfigureerd.", noRedirects: "Geen omleiding geconfigureerd.",
      expired: "Verlopen", renew: "Vernieuwen", daysLeft: "{n} d",
      on: "Aan", off: "Uit",
      enableRule: "Inschakelen", disableRule: "Uitschakelen",
      ed_zoraxy_url: "Zoraxy-URL", ed_entity_prefix: "Entiteitsprefix",
      ed_zoraxy_url_helper: "Wordt geopend bij een klik op de kaarttitel",
      ed_entity_prefix_helper: "Gemeenschappelijk deel van de entiteits-ID's, bijvoorbeeld zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Volledige kaart tonen", zoomOut: "Terug naar de compacte weergave",
      ruleCount: "Regels: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Detailknop", ed_zoom_helper: "Schakelt naar de volledige kaart en terug",
      ed_language: "Taal", lang_auto: "Auto (taal van Home Assistant)",
      unavailable: "Niet beschikbaar", cancel: "Annuleren",
      confirmPort80Off: "Niet meer luisteren op poort 80? HTTP-verzoeken en ACME HTTP-challenges bereiken Zoraxy dan niet meer.",
      confirmRuleOff: "Proxyregel voor {domain} uitschakelen? De dienst is dan niet meer bereikbaar via Zoraxy.",
    },
    pt: {
      active: "Ativo", inactive: "Inativo",
      rules: "Regras", activeRules: "Ativas", certs: "Cert.", port: "Porta",
      controls: "Controlos", httpsRedirect: "Redireciona\u00admento HTTPS", port80: "Porta 80", devMode: "Modo dev",
      certsSection: "Certificados", proxyRules: "Regras de proxy", redirections: "Redirecionamentos",
      noCerts: "Nenhum certificado encontrado.", noRules: "Nenhuma regra configurada.", noRedirects: "Nenhum redirecionamento configurado.",
      expired: "Expirado", renew: "Renovar", daysLeft: "{n} d",
      on: "On", off: "Off",
      enableRule: "Ativar", disableRule: "Desativar",
      ed_zoraxy_url: "URL do Zoraxy", ed_entity_prefix: "Prefixo das entidades",
      ed_zoraxy_url_helper: "Aberto ao clicar no título do cartão",
      ed_entity_prefix_helper: "Parte comum dos IDs de entidade, por exemplo zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Mostrar o cartão completo", zoomOut: "Voltar à vista compacta",
      ruleCount: "Regras: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Botão de detalhe", ed_zoom_helper: "Muda para o cartão completo e volta",
      ed_language: "Idioma", lang_auto: "Auto (idioma do Home Assistant)",
      unavailable: "Indisponível", cancel: "Cancelar",
      confirmPort80Off: "Deixar de escutar na porta 80? Os pedidos HTTP e os desafios ACME HTTP deixarão de chegar ao Zoraxy.",
      confirmRuleOff: "Desativar a regra de proxy de {domain}? O serviço deixará de estar acessível através do Zoraxy.",
    },
    pl: {
      active: "Aktywny", inactive: "Nieaktywny",
      rules: "Reguły", activeRules: "Aktywne", certs: "Cert.", port: "Port",
      controls: "Sterowanie", httpsRedirect: "Przekiero\u00adwanie HTTPS", port80: "Port 80", devMode: "Tryb dev",
      certsSection: "Certyfikaty", proxyRules: "Reguły proxy", redirections: "Przekierowania",
      noCerts: "Nie znaleziono certyfikatu.", noRules: "Brak skonfigurowanych reguł.", noRedirects: "Brak skonfigurowanych przekierowań.",
      expired: "Wygasł", renew: "Odnów", daysLeft: "{n} d",
      on: "Wł.", off: "Wył.",
      enableRule: "Włącz", disableRule: "Wyłącz",
      ed_zoraxy_url: "Adres URL Zoraxy", ed_entity_prefix: "Prefiks encji",
      ed_zoraxy_url_helper: "Otwierany po kliknięciu tytułu karty",
      ed_entity_prefix_helper: "Wspólna część identyfikatorów encji, na przykład zoraxy_reverse_proxy_zoraxy",
      zoomIn: "Pokaż pełną kartę", zoomOut: "Wróć do widoku kompaktowego",
      ruleCount: "Reguły: {a}/{n}", certCount: "Cert.: {n}",
      ed_zoom: "Przycisk szczegółów", ed_zoom_helper: "Przełącza na pełną kartę i z powrotem",
      ed_language: "Język", lang_auto: "Auto (język Home Assistant)",
      unavailable: "Niedostępny", cancel: "Anuluj",
      confirmPort80Off: "Przestać nasłuchiwać na porcie 80? Żądania HTTP i wyzwania ACME HTTP nie będą już docierać do Zoraxy.",
      confirmRuleOff: "Wyłączyć regułę proxy dla {domain}? Usługa przestanie być dostępna przez Zoraxy.",
    },
  };

  static CSS = `
    :host {
      display: block;
      --zx-accent: var(--primary-color, #03a9f4);
      --zx-ok: var(--success-color, #43a047);
      --zx-warn: var(--warning-color, #ffa600);
      --zx-crit: var(--error-color, #db4437);
    }
    /* The card is a size container: the header and the controls adapt to the card's width, not the window's. */
    ha-card { overflow: hidden; container-type: inline-size; }
    .icon { width: 18px; height: 18px; fill: currentColor; flex: none; }
    .ok { --c: var(--zx-ok); } .warn { --c: var(--zx-warn); } .crit { --c: var(--zx-crit); } .idle { --c: var(--secondary-text-color); }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c, var(--zx-ok)); flex: none; display: inline-block; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;
            background: color-mix(in srgb, var(--c, var(--zx-ok)) 15%, transparent); white-space: nowrap;
            color: color-mix(in srgb, var(--c, var(--zx-ok)) 50%, var(--primary-text-color));
            box-sizing: border-box; max-width: 100%; min-width: 0; }
    .chip .ct { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 8px; }
    .logo { width: 40px; height: 40px; flex: none; }
    /* Narrow header: the title block gives way but keeps about four letters (5ch of the 16 px title); the status
       pill gives way next (at most half the header, its text in an ellipsis); the icon buttons never shrink. */
    .titles { flex: 1 1 auto; min-width: 5ch; font-size: 16px; }
    #status { display: flex; flex: 0 1 auto; min-width: 0; max-width: 50%; }
    .name { font-size: 16px; font-weight: 500; line-height: 1.25; color: var(--primary-text-color); text-decoration: none;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
    a.name:hover { text-decoration: underline; }
    .sub { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .content { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 12px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 6px; }
    .tile { display: flex; flex-direction: column; align-items: center; gap: 0; padding: 6px 8px; border-radius: 10px; min-width: 0;
            background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .mv { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
    .ml { font-size: 11px; color: var(--secondary-text-color); }
    .sec-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 6px; }
    .sec-header[aria-expanded="false"] { margin-bottom: 0; }
    .section-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; text-transform: uppercase;
                     letter-spacing: .04em; color: var(--secondary-text-color); }
    .section-title { min-width: 0; }
    .section-title > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .section-title .icon { width: 16px; height: 16px; }
    .sec-arrow { color: var(--secondary-text-color); display: flex; flex: none; transition: transform .2s ease; }
    .sec-arrow.closed { transform: rotate(-90deg); }
    .controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .ctrl { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 10px; cursor: pointer;
            box-sizing: border-box; height: 100%;
            border: none; width: 100%; font-family: inherit; color: var(--primary-text-color);
            background: var(--secondary-background-color, rgba(127,127,127,.08)); transition: background .15s; }
    .ctrl .icon { color: var(--c, var(--secondary-text-color)); }
    .ctrl:hover { background: color-mix(in srgb, var(--zx-accent) 15%, var(--secondary-background-color, transparent)); }
    .ctrl:disabled { cursor: not-allowed; }
    .ctrl:disabled:hover { background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    /* Long words break at their soft hyphens (in the translations), a word is cut only as a last resort;
       the label takes the free height, so the On / Off lines of the three tiles stay aligned. */
    .cl { font-size: 11px; color: var(--secondary-text-color); text-align: center; overflow-wrap: break-word; max-width: 100%; flex: 1 0 auto; }
    .cs { font-size: 11px; font-weight: 500; color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); text-align: center; }
    .row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; gap: 8px; font-size: 13px; }
    .row + .row { border-top: 1px solid var(--divider-color); }
    .row-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    /* A row with a target (rules, redirects): the domain keeps its width, the target takes what is left (from a
       zero basis up to its own width) and gives way first, down to about four characters; only then does the
       domain shrink. Both end in an ellipsis, with the full text in their title. */
    .row-right:has(> .row-sub) { flex: 1 1 auto; justify-content: flex-end; }
    .row-right > :not(.row-sub), .row-sub.row-code { flex-shrink: 0; }
    .row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-sub { font-size: 11px; color: var(--secondary-text-color); width: 0; flex-grow: 1; min-width: 4ch; max-width: max-content;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-sub.row-code { width: auto; flex-grow: 0; min-width: 0; }
    .domain-link { cursor: pointer; }
    .domain-link:hover { text-decoration: underline; }
    .sec-header:focus-visible, .domain-link:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; border-radius: 4px; }
    .empty { color: var(--secondary-text-color); font-size: 13px; padding: 4px 0; margin: 0; }
    /* Neutral button (renew); a proxy rule's On / Off button is tinted with its state colour. */
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;
                border: 1px solid transparent; border-radius: 10px; padding: 4px 8px; font-family: inherit;
                font-size: 12px; font-weight: 500; color: var(--primary-text-color); transition: background .15s;
                background: var(--secondary-background-color, rgba(127,127,127,.12)); }
    .icon-btn:hover { background: color-mix(in srgb, var(--primary-text-color) 8%, var(--secondary-background-color, transparent)); }
    .icon-btn.rule-btn { color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); background: color-mix(in srgb, var(--c) 16%, transparent); }
    .icon-btn.rule-btn:hover { background: color-mix(in srgb, var(--c) 24%, transparent); }
    .icon-btn:disabled { opacity: .5; cursor: not-allowed; }
    .icon-btn.busy { color: var(--zx-warn); }
    /* In-card confirmation (turning port 80 or a proxy rule off), as in the other ha-* cards: a backdrop over the
       card with a small dialog at its top, so it stays in view on a long card. */
    ha-card.dialog-open { position: relative; min-height: 150px; }
    .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-start; justify-content: center;
                padding-top: 12px; box-sizing: border-box; z-index: 9; border-radius: inherit; }
    .modal { background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color); width: min(92%, 340px); max-height: calc(100% - 24px);
             overflow: auto; box-sizing: border-box; border-radius: 14px; padding: 16px; box-shadow: 0 8px 30px rgba(0,0,0,.4);
             display: flex; flex-direction: column; gap: 12px; }
    .modal .msg { font-size: 14px; line-height: 1.4; overflow-wrap: break-word; }
    .modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .modal-actions .btn { border: none; border-radius: 8px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
                          background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color); }
    .modal-actions .btn.primary { --c: var(--zx-crit); background: color-mix(in srgb, var(--c) 15%, transparent);
                                  color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); }
    .modal-actions .btn:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; }
    /* Narrow card (the mini card's full view at 4 columns): smaller logo and gaps, the status pill shows its dot
       only (its text stays in its title and for screen readers), the controls go one per line. */
    @container (max-width: 200px) {
      .header { gap: 6px; }
      .header .logo { width: 28px; height: 28px; }
      #status .ct { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      #status .chip { padding: 1px 8px; }
      .controls { grid-template-columns: minmax(0, 1fr); }
      .ctrl { flex-direction: row; justify-content: flex-start; gap: 6px; padding: 6px 8px; }
      .ctrl .cl { flex: 1 1 auto; min-width: 0; text-align: start; }
    }
    @container (max-width: 150px) {
      .header .logo { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sec-arrow, .ctrl, .icon-btn { transition: none; }
    }
  `;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sectionOpen = { ...ZoraxyCard.SECTION_DEFAULTS };
    this._states = null;
    this._renderKey = null;
  }

  static SECTION_DEFAULTS = { controls: true, certs: false, rules: false, redirects: false };

  // A click elsewhere on the page folds the sections back to their defaults (as in ha-carburants-france).
  // A click, not a pointerdown: folding on press would shift the layout under the pointer before the click.
  connectedCallback() {
    this._onOutside ??= (ev) => {
      if (ev.composedPath().includes(this)) return;
      // Closed by a click elsewhere on the page: the focus goes where that click put it.
      if (this._confirm) this._closeConfirm(false);
      for (const [id, open] of Object.entries(ZoraxyCard.SECTION_DEFAULTS)) {
        if (this._sectionOpen[id] !== open) this._setSection(id, open);
      }
    };
    document.addEventListener("click", this._onOutside, true);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this._onOutside, true);
    if (this._onConfirmKey) document.removeEventListener("keydown", this._onConfirmKey, true);
    clearTimeout(this._refreshTimer);
  }

  _setSection(id, open) {
    this._sectionOpen[id] = open;
    const header = this.shadowRoot.querySelector(`.sec-header[data-id="${id}"]`);
    const content = this.shadowRoot.querySelector(`.sec-content[data-id="${id}"]`);
    const arrow = this.shadowRoot.querySelector(`.sec-arrow[data-id="${id}"]`);
    if (header) header.setAttribute("aria-expanded", String(open));
    if (content) content.style.display = open ? "block" : "none";
    if (arrow) arrow.classList.toggle("closed", !open);
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    for (const key of ["zoraxy_url", "entity_prefix", "language"]) {
      if (config[key] != null && typeof config[key] !== "string") throw new Error(`${key} must be a string`);
    }
    this._config = config;
    this._states = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Re-render only when a state the card shows changed (Home Assistant keeps the same state object while it
    // doesn't change), the language changed, or the hour changed (certificate countdowns).
    const states = this._entityIds().map((id) => hass.states[id]);
    const key = `${this._lang()}|${Math.floor(Date.now() / 3600000)}`;
    if (this._states && key === this._renderKey && states.length === this._states.length && states.every((st, i) => st === this._states[i])) return;
    this._render();
  }

  // Entities of this card, found from the prefix. The list is cached on hass.entities (the entity registry),
  // which only changes when entities are added or removed, not on every state change.
  _entityIds() {
    const registry = this._hass?.entities;
    const prefix = this._prefix();
    if (registry && this._idsFor === registry && this._idsPrefix === prefix) return this._ids;
    const marker = `.${prefix}_`;
    // Without the registry (older frontends, tests), the states are scanned each time.
    const ids = Object.keys(registry || this._hass?.states || {}).filter((id) => id.includes(marker)).sort();
    if (!registry) return ids;
    this._ids = ids;
    this._idsFor = registry;
    this._idsPrefix = prefix;
    return this._ids;
  }

  // Header and metrics, one line per section header, and the controls when that section is open (7 by default).
  getCardSize() {
    const open = this._sectionOpen;
    const rows = (n) => Math.ceil(n / 2);
    const rules = this._hass ? this._attr(`sensor.${this._prefix()}_regles_proxy`, "rules") || [] : [];
    const redirects = this._hass ? this._attr(`sensor.${this._prefix()}_regles_proxy`, "redirects") || [] : [];
    const certs = this._hass ? this._entityIds().filter((id) => id.startsWith(`sensor.${this._prefix()}_cert_`)).length : 0;
    return 2 + 4 + (open.controls ? 1 : 0) + (open.certs ? rows(certs) : 0) + (open.rules ? rows(rules.length) : 0) + (open.redirects ? rows(redirects.length) : 0);
  }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  static getConfigElement() { return document.createElement("zoraxy-card-editor"); }
  static getStubConfig() { return { zoraxy_url: "http://zoraxy.local:8000" }; }

  // ── Helpers ────────────────────────────────────────────────────────────────


  _lang() {
    return ZoraxyCard.langOfHass(this._hass, this._config);
  }

  // The card and its editors resolve the language the same way: the card's `language` option, then the user's
  // locale, then the server language.
  static langOfHass(hass, config) {
    return ZoraxyCard.langOf(config?.language || hass?.locale?.language || hass?.language);
  }

  // The supported language matching a locale: the whole locale when the card has it ("sr-Latn"), else the part
  // before the dash ("de-AT" → "de"), English otherwise.
  static langOf(locale) {
    const value = String(locale || "en").toLowerCase();
    const langs = Object.keys(ZoraxyCard.I18N);
    return langs.find((l) => l.toLowerCase() === value) ?? langs.find((l) => l === value.split("-")[0]) ?? "en";
  }

  _t(key) { return ZoraxyCard.I18N[this._lang()]?.[key] ?? ZoraxyCard.I18N.en[key] ?? key; }

  _prefix() { return this._config?.entity_prefix || "zoraxy_reverse_proxy_zoraxy"; }
  _state(id) { return this._hass?.states[id]?.state ?? "unavailable"; }
  // A state meant to be read: "unknown" / "unavailable" (or a missing entity) shows as "–", never as the raw word.
  _value(id) {
    const state = this._state(id);
    return state === "unknown" || state === "unavailable" ? "–" : state;
  }
  _attr(id, attr) { return this._hass?.states[id]?.attributes?.[attr]; }
  _isOn(id) { return this._state(id) === "on"; }

  async _toggle(id) {
    // Home Assistant already shows the error (HomeAssistantError) in a toast.
    await this._hass
      .callService("homeassistant", this._isOn(id) ? "turn_off" : "turn_on", { entity_id: id })
      .catch((e) => console.warn("Zoraxy:", e?.message ?? e));
  }
  async _pressButton(id) {
    await this._hass.callService("button", "press", { entity_id: id });
  }

  async _toggleRule(domain, currentlyEnabled, btn) {
    btn.disabled = true;

    // Optimistic update of the button
    const newEnabled = !currentlyEnabled;
    btn.className = `icon-btn rule-btn ${newEnabled ? "ok" : "crit"}`;
    btn.dataset.ruleEnabled = String(newEnabled);
    btn.title = newEnabled ? this._t("disableRule") : this._t("enableRule");
    btn.innerHTML = this._ruleBtnContent(newEnabled);

    try {
      await this._hass.callService("zoraxy", "toggle_proxy_rule", {
        domain: domain,
        enable: newEnabled,
      });
      // Full re-render once the Home Assistant coordinator has refreshed the data
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        if (this._hass) this._render();
      }, 3000);
    } catch (e) {
      console.error("Zoraxy toggleRule error:", e);
      // Roll back the optimistic update
      if (this._hass) this._render();
    } finally {
      btn.disabled = false;
    }
  }

  _dot(on) {
    return `<span class="dot ${on ? "ok" : "crit"}"></span>`;
  }

  _chip(text, cls) {
    return `<span class="chip ${cls}">${text}</span>`;
  }

  // The proxy's status: on, off, or unavailable / unknown (grey, never shown as "Inactive"). The text is also the
  // pill's title and label, for the narrow card where only the dot shows.
  _statusChip(state) {
    const [label, cls] = state === "on" ? [this._t("active"), "ok"] : state === "off" ? [this._t("inactive"), "crit"] : [this._t("unavailable"), "idle"];
    const text = zoraxyEsc(label);
    return `<span class="chip ${cls}" title="${text}"><span class="dot"></span><span class="ct">${text}</span></span>`;
  }

  _ruleBtnContent(on) {
    return `<span class="dot"></span>${on ? this._t("on") : this._t("off")}`;
  }

  _daysUntil(dateStr) {
    if (!dateStr || dateStr === "unavailable" || dateStr === "unknown") return null;
    // new Date("garbage") gives an Invalid Date, not an exception: NaN would show as "J-NaN" with a green pill.
    const days = Math.floor((new Date(dateStr) - Date.now()) / 86400000);
    return Number.isNaN(days) ? null : days;
  }

  _mdi(path) {
    return `<svg class="icon" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
  }

  // Generic row: dot + label on the left, content on the right
  _row(dotOn, label, right) {
    return `<div class="row">
      <div class="row-left">${this._dot(dotOn)}<span class="row-label" title="${zoraxyEsc(label)}">${zoraxyEsc(label)}</span></div>
      <div class="row-right">${right}</div>
    </div>`;
  }

  _section(id, title, icon, content) {
    const open = this._sectionOpen[id] === true;
    return `<div class="section">
      <div class="sec-header" data-id="${id}" role="button" tabindex="0" aria-expanded="${open}">
        <div class="section-title">${this._mdi(icon)}<span title="${zoraxyEsc(title)}">${zoraxyEsc(title)}</span></div>
        <span class="sec-arrow${open ? "" : " closed"}" data-id="${id}">${this._mdi(ZoraxyCard.ICONS.chevronDown)}</span>
      </div>
      <div class="sec-content" data-id="${id}" style="display:${open ? "block" : "none"};">${content}</div>
    </div>`;
  }

  // ── Builders ───────────────────────────────────────────────────────────────

  // `available` false: the rules sensor is unavailable or unknown, its (missing) list is not "no rule".
  _buildRules(rules, available = true) {
    if (!available) return `<p class="empty">${this._t("unavailable")}</p>`;
    if (!rules?.length) return `<p class="empty">${this._t("noRules")}</p>`;
    return rules.map((r) => {
      const target = zoraxyEsc(r.target);
      const domain = zoraxyEsc(r.domain);
      // A wildcard rule (*.example.org) is not a valid URL: plain label, no link.
      const left = String(r.domain ?? "").includes("*")
        ? `<span class="row-label" title="${domain}">${domain}</span>`
        : `<span class="row-label domain-link" title="${domain}" role="link" tabindex="0" data-href="https://${domain}">${domain}</span>`;
      const right = `<span class="row-sub" title="${target}">${target}</span>
        <button class="icon-btn rule-btn ${r.enabled ? "ok" : "crit"}"
          data-rule-domain="${domain}"
          data-rule-enabled="${r.enabled ? "true" : "false"}"
          title="${r.enabled ? this._t("disableRule") : this._t("enableRule")}">${this._ruleBtnContent(r.enabled)}</button>`;
      return `<div class="row">
        <div class="row-left">${left}</div>
        <div class="row-right">${right}</div>
      </div>`;
    }).join("");
  }

  // Certificate expiry sensors, with the days left (null when unknown).
  _certSensors(prefix) {
    const certPrefix = `sensor.${prefix}_cert_`;
    return this._entityIds()
      .filter((id) => id.startsWith(certPrefix) && this._hass.states[id])
      .map((id) => ({ id, suffix: id.slice(certPrefix.length), days: this._daysUntil(this._state(id)) }));
  }

  // Chip class for a certificate countdown: red under 7 days, orange under 30.
  _daysCls(days) {
    return days === null ? "idle" : days < 7 ? "crit" : days < 30 ? "warn" : "ok";
  }

  _daysLabel(days) {
    if (days === null) return "?";
    return days < 0 ? this._t("expired") : this._t("daysLeft").replace("{n}", days);
  }

  _buildCerts(prefix) {
    const sensors = this._certSensors(prefix);
    if (!sensors.length) return `<p class="empty">${this._t("noCerts")}</p>`;
    return sensors.map(({ id: sensorId, suffix, days }) => {
      const isExpiring = this._isOn(`binary_sensor.${prefix}_cert_expirant_${suffix}`);
      const domain    = this._attr(sensorId, "domain") || suffix.replace(/_/g, ".");
      const btnId     = `button.${prefix}_renouveler_${suffix}`;
      // A button entity is "unknown" until first pressed, which does not block it; unavailable (or missing) does.
      const off = this._state(btnId) === "unavailable" ? " disabled" : "";
      const right = `${this._chip(this._daysLabel(days), this._daysCls(days))}
        <button class="icon-btn renew-btn" data-entity="${zoraxyEsc(btnId)}" title="${this._t("renew")}"${off}>
          ${this._mdi(ZoraxyCard.ICONS.refresh)}
        </button>`;
      return this._row(!isExpiring, domain, right);
    }).join("");
  }

  _buildRedirects(redirects, available = true) {
    if (!available) return `<p class="empty">${this._t("unavailable")}</p>`;
    if (!redirects?.length) return `<p class="empty">${this._t("noRedirects")}</p>`;
    return redirects.map(r => {
      const src   = r.RedirectURL || "?";
      const dst   = r.TargetURL || "?";
      const code  = r.StatusCode ? `${r.StatusCode}` : "";
      const https = dst.startsWith("https");
      const right = `<span class="row-sub row-code">→ ${zoraxyEsc(code)}</span>
        <span class="row-sub" title="${zoraxyEsc(dst)}">${zoraxyEsc(dst)}</span>
        ${https ? this._mdi(ZoraxyCard.ICONS.lock) : ""}`;
      return this._row(true, src, right);
    }).join("");
  }

  // ── Full render ────────────────────────────────────────────────────────────

  // Remembers what this render shows, so that `set hass` skips the next ones until something changes.
  _snapshot() {
    this._states = this._entityIds().map((id) => this._hass.states[id]);
    this._renderKey = `${this._lang()}|${Math.floor(Date.now() / 3600000)}`;
  }

  // Card title, a link to the Zoraxy web interface when `zoraxy_url` is an http(s) address.
  _nameLink() {
    const url = zoraxySafeUrl(this._config.zoraxy_url);
    return `<a class="name" ${url ? `href="${zoraxyEsc(url)}" target="_blank" rel="noopener noreferrer"` : ""}>Zoraxy</a>`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const focus = this._focusKey();
    this._draw();
    this._restoreFocus(focus);
  }

  // The card is redrawn with innerHTML: the focused control (a tile, a section header, a popup button…) is
  // found again by what identifies it, so a state change does not take the keyboard focus away.
  static FOCUS_ATTRS = ["id", "data-action", "data-rule-domain", "data-entity", "data-id"];

  _focusKey() {
    const el = this.shadowRoot.activeElement;
    if (!el?.getAttribute) return null;
    const attr = ZoraxyCard.FOCUS_ATTRS.find((a) => el.getAttribute(a));
    // The first class only: the state classes (ok, idle…) may change with the render.
    return attr ? { cls: el.classList?.[0], attr, value: el.getAttribute(attr) } : null;
  }

  _restoreFocus(key) {
    if (!key || this.shadowRoot.activeElement) return;
    [...(this.shadowRoot.querySelectorAll?.(`[${key.attr}]`) || [])]
      .find((el) => el.classList?.[0] === key.cls && el.getAttribute(key.attr) === key.value)
      ?.focus({ preventScroll: true });
  }

  _draw() {
    this._snapshot();

    const p   = this._prefix();
    const sp  = `sensor.${p}`;
    const bp  = `binary_sensor.${p}`;

    const rulesCount    = this._value(`${sp}_regles_proxy`);
    const activeCount   = this._value(`${sp}_regles_actives`);
    const certCount     = this._value(`${sp}_certificats_tls`);
    const port          = this._value(`${sp}_port_entrant`);
    const rules         = this._attr(`${sp}_regles_proxy`, "rules") || [];
    const redirects     = this._attr(`${sp}_regles_proxy`, "redirects") || [];
    // Rules sensor unavailable or unknown: its lists are not known, not empty.
    const listed        = rulesCount !== "–";
    const zoraxyUrl     = zoraxySafeUrl(this._config.zoraxy_url);
    const sub           = zoraxyUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "") || "Reverse proxy";

    // A control shows its binary sensor and toggles its switch: either unavailable or unknown, the tile says so
    // (never "Off") and is disabled.
    const ctrl = ({ id, icon, label }) => {
      const state = this._ctrlState(id);
      const [cls, text] = state === "on" ? ["ok", this._t("on")] : state === "off" ? ["idle", this._t("off")] : ["idle", this._t("unavailable")];
      return `
      <button class="ctrl ${cls}" id="${id}"${state ? "" : " disabled"}>
        ${this._mdi(ZoraxyCard.ICONS[icon])}
        <span class="cl">${this._t(label)}</span>
        <span class="cs">${text}</span>
      </button>`;
    };

    const metric = (value, label) => `<div class="tile"><div class="mv">${zoraxyEsc(value)}</div><div class="ml">${label}</div></div>`;

    this.shadowRoot.innerHTML = `
      <style>${this.constructor.CSS}</style>
      <ha-card lang="${this._lang()}">
        <div class="header">
          ${ZoraxyCard.LOGO}
          <div class="titles">
            ${this._nameLink()}
            <div class="sub">${zoraxyEsc(sub)}</div>
          </div>
          <span id="status">${this._statusChip(this._state(`${bp}_proxy_actif`))}</span>
        </div>

        <div class="content">
          <div class="metrics">
            ${metric(rulesCount, this._t("rules"))}
            ${metric(activeCount, this._t("activeRules"))}
            ${metric(certCount, this._t("certs"))}
            ${metric(port, this._t("port"))}
          </div>

          ${this._section("controls", this._t("controls"), ZoraxyCard.ICONS.server, `<div class="controls">
            ${ZoraxyCard.CONTROLS.map(ctrl).join("")}
          </div>`)}

          ${this._section("certs",     `${this._t("certsSection")} (${certCount})`,       ZoraxyCard.ICONS.cert,     this._buildCerts(p))}
          ${this._section("rules",     `${this._t("proxyRules")} (${listed ? rules.length : "–"})`,   ZoraxyCard.ICONS.router,   this._buildRules(rules, listed))}
          ${this._section("redirects", `${this._t("redirections")} (${listed ? redirects.length : "–"})`, ZoraxyCard.ICONS.redirect, this._buildRedirects(redirects, listed))}
        </div>
      </ha-card>`;

    // Sections collapse/expand
    // Header and domain links are not buttons/anchors: Enter and Space activate them from the keyboard too.
    const onKey = (el, action) => el.addEventListener("keydown", (e) => {
      if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      action(e);
    });
    this.shadowRoot.querySelectorAll(".sec-header").forEach(h => {
      const toggle = () => this._setSection(h.dataset.id, !this._sectionOpen[h.dataset.id]);
      h.addEventListener("click", toggle);
      onKey(h, toggle);
    });

    // Switches
    for (const { id } of ZoraxyCard.CONTROLS) {
      this.shadowRoot.getElementById(id)?.addEventListener("click", () => this._onCtrl(id));
    }

    // Certificate renewal buttons
    this.shadowRoot.querySelectorAll(".renew-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        btn.classList.add("busy");
        btn.disabled = true;
        try {
          await this._pressButton(btn.dataset.entity);
        } catch (err) {
          console.warn("Zoraxy:", err?.message ?? err);
        } finally {
          setTimeout(() => { btn.classList.remove("busy"); btn.disabled = false; }, 3000);
        }
      });
    });

    // Proxy rule domain links
    this.shadowRoot.querySelectorAll(".domain-link").forEach(el => {
      const open = (e) => {
        e.stopPropagation();
        window.open(el.dataset.href, "_blank", "noopener,noreferrer");
      };
      el.addEventListener("click", open);
      onKey(el, open);
    });

    // Proxy rule enable/disable buttons
    this.shadowRoot.querySelectorAll(".rule-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        this._onRule(btn);
      });
    });

    this._renderConfirm();
  }

  // ── Actions and their confirmation ────────────────────────────────────────

  // The three control tiles: the binary sensor shown and the switch toggled share the entity suffix.
  // `confirm`: turning it off asks first (port 80 off also stops the ACME HTTP challenges).
  static CONTROLS = [
    { id: "ctrl-https", suffix: "redirection_https", icon: "lock", label: "httpsRedirect" },
    { id: "ctrl-port80", suffix: "ecoute_port_80", icon: "web", label: "port80", confirm: "confirmPort80Off" },
    { id: "ctrl-devmode", suffix: "mode_developpement", icon: "code", label: "devMode" },
  ];

  // "on" / "off" when both the binary sensor and the switch of a control are known, null otherwise.
  _ctrlState(id) {
    const { suffix } = ZoraxyCard.CONTROLS.find((c) => c.id === id);
    const shown = this._state(`binary_sensor.${this._prefix()}_${suffix}`);
    const sw = this._state(`switch.${this._prefix()}_${suffix}`);
    return ["on", "off"].includes(shown) && ["on", "off"].includes(sw) ? shown : null;
  }

  // Right after the popup closes, a click is the rest of a double click on its button: ignored.
  _justConfirmed() {
    return Date.now() - (this._confirmClosedAt ?? 0) < ZoraxyCard.CONFIRM_GUARD_MS;
  }

  _onCtrl(id) {
    if (this._justConfirmed()) return;
    const { suffix, confirm } = ZoraxyCard.CONTROLS.find((c) => c.id === id);
    const entity = `switch.${this._prefix()}_${suffix}`;
    // Unavailable or unknown: nothing to toggle (the tile is disabled, keyboard included).
    if (!this._ctrlState(id)) return;
    if (confirm && this._isOn(entity)) {
      this._openConfirm({ text: this._t(confirm), ok: this._t("disableRule"), run: () => this._toggle(entity), from: { id } });
    } else {
      this._toggle(entity);
    }
  }

  _onRule(btn) {
    if (this._justConfirmed()) return;
    const domain = btn.dataset.ruleDomain;
    if (btn.dataset.ruleEnabled !== "true") return this._toggleRule(domain, false, btn);
    this._openConfirm({
      text: this._t("confirmRuleOff").replace("{domain}", domain),
      ok: this._t("disableRule"),
      // The card may have been redrawn meanwhile: the rule's current button.
      run: () => {
        const current = this._ruleBtn(domain);
        if (current) return this._toggleRule(domain, true, current);
      },
      from: { domain },
    });
  }

  _ruleBtn(domain) {
    return [...(this.shadowRoot.querySelectorAll?.(".rule-btn") || [])].find((b) => b.dataset.ruleDomain === domain);
  }

  static CONFIRM_GUARD_MS = 400;

  // Cancel, Escape, the backdrop and a click outside the card close the popup without acting; the focus then
  // goes back to the button that opened it.
  _openConfirm(confirm) {
    this._confirm = confirm;
    this._onConfirmKey ??= (ev) => {
      if (!this._confirm) return;
      if (ev.key === "Escape") {
        ev.stopPropagation();
        this._closeConfirm();
      } else if (ev.key === "Tab") {
        // Tab and Shift+Tab stay on the popup's two buttons.
        const btns = [...(this.shadowRoot.querySelectorAll?.(".modal .btn") || [])];
        if (!btns.length) return;
        ev.preventDefault();
        const i = btns.indexOf(this.shadowRoot.activeElement);
        btns[(i + (ev.shiftKey ? -1 : 1) + btns.length) % btns.length].focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", this._onConfirmKey, true);
    this._renderConfirm();
    this.shadowRoot.querySelector?.(".modal .primary")?.focus({ preventScroll: true });
  }

  _closeConfirm(restoreFocus = true) {
    const from = this._confirm?.from;
    this._confirm = null;
    this._confirmClosedAt = Date.now();
    document.removeEventListener("keydown", this._onConfirmKey, true);
    this._renderConfirm();
    if (!restoreFocus || !from) return;
    const opener = from.id ? this.shadowRoot.getElementById?.(from.id) : this._ruleBtn(from.domain);
    opener?.focus({ preventScroll: true });
  }

  // Adds the popup to the card (or removes it), after each render too: a state change redraws the card.
  _renderConfirm() {
    const card = this.shadowRoot.querySelector?.("ha-card");
    if (!card) return;
    card.querySelector(".backdrop")?.remove();
    card.classList.toggle("dialog-open", !!this._confirm);
    if (!this._confirm) return;
    card.insertAdjacentHTML("beforeend", this._confirmHtml());
    const backdrop = card.querySelector(".backdrop");
    backdrop.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const action = ev.composedPath().find((n) => n.dataset?.action)?.dataset.action;
      if (action === "confirm_ok") {
        const { run } = this._confirm;
        this._closeConfirm();
        run();
      } else if (action === "confirm_cancel" || ev.target === backdrop) {
        this._closeConfirm();
      }
    });
  }

  _confirmHtml() {
    const c = this._confirm;
    return `<div class="backdrop" data-action="confirm_backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="zx-confirm-msg">
        <div class="msg" id="zx-confirm-msg">${zoraxyEsc(c.text)}</div>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="confirm_cancel">${zoraxyEsc(this._t("cancel"))}</button>
          <button type="button" class="btn primary" data-action="confirm_ok">${zoraxyEsc(c.ok)}</button>
        </div>
      </div>
    </div>`;
  }
}

// ── zoraxy-mini-card ──────────────────────────────────────────────────────────
// What the full card shows, on two lines: the logo, title and status pill, then one chip per key figure or alert.
// Its detail button (top right, `zoom: false` removes it) switches it to the full card and back; a click anywhere
// else brings it back too, unless it lands in a dialog opened from the card (more-info).
class ZoraxyMiniCard extends ZoraxyCard {
  static CSS = `${ZoraxyCard.CSS}
    ha-card:has(.mini) { padding: 12px; }
    .mini { display: flex; align-items: center; gap: 10px; }
    /* Top-aligned: 12 px from the card's top edge (the two lines are taller than the logo). */
    .mini .logo { width: 32px; height: 32px; align-self: flex-start; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    /* The title gives way but keeps about four letters; the link stays the size of its text. */
    .mini .name { flex: 1 1 auto; min-width: 5ch; max-width: max-content; }
    .head #status { margin-left: auto; }
    .rs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -4px; }
    .rs:empty { display: none; }
    .r { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; padding: 0 6px 0 4px; border-radius: 999px;
         font-size: 12px; font-weight: 500; line-height: 18px; white-space: nowrap; color: var(--primary-text-color); }
    .r .icon { width: 13px; height: 13px; color: var(--c); }
    /* A chip never gets wider than the card: its text ends in an ellipsis (full text in the tooltip). */
    .r { box-sizing: border-box; max-width: 100%; min-width: 0; }
    .r .rt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .r.pill { color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color)); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .r:hover { background: color-mix(in srgb, var(--c) 20%, var(--secondary-background-color, transparent)); }
    /* A pill keeps a light tint on hover, so its darkened text stays readable. */
    .r.pill:hover { background: color-mix(in srgb, var(--c) 20%, transparent); }
    .r:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 2px; }
    .zoom { all: unset; flex: none; cursor: pointer; width: 24px; height: 24px; margin: -4px -4px -4px 0; border-radius: 50%;
            display: grid; place-items: center; color: var(--secondary-text-color); }
    .zoom .icon { width: 16px; height: 16px; }
    .zoom:hover { background: color-mix(in srgb, var(--secondary-text-color) 16%, transparent); color: var(--primary-text-color); }
    .zoom:focus-visible { outline: 2px solid var(--zx-accent); outline-offset: 1px; }
    .header .zoom { align-self: flex-start; margin: -4px -4px 0 0; }
    @container (max-width: 200px) {
      .mini { gap: 8px; }
      .head { gap: 6px; }
      .mini .logo { width: 28px; height: 28px; }
    }
    @container (max-width: 150px) {
      .mini .logo { display: none; }
    }
  `;

  static getConfigElement() { return document.createElement("zoraxy-mini-card-editor"); }

  constructor() {
    super();
    this._zoomed = false;
    this._onUnzoom = (ev) => {
      const path = ev.composedPath();
      if (!this._zoomed || path.includes(this)) return;
      if (path.some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName))) return;
      this._zoomed = false;
      this._render();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this._onUnzoom, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this._onUnzoom, true);
  }

  setConfig(config) {
    if (config?.zoom != null && typeof config.zoom !== "boolean") throw new Error("zoom must be true or false");
    super.setConfig(config);
  }

  getCardSize() { return this._zoomed ? super.getCardSize() : 2; }
  getGridOptions() { return { columns: 12, min_columns: 4, rows: "auto" }; }

  // A chip: plain (tinted icon) while all is well, a tinted pill when it needs a look. It opens the entity's more-info.
  _miniChip(entity, icon, text, cls, pill) {
    return `<button class="r ${cls}${pill ? " pill" : ""}" data-entity="${zoraxyEsc(entity)}" title="${zoraxyEsc(text)}">${this._mdi(
      ZoraxyCard.ICONS[icon],
    )}<span class="rt">${zoraxyEsc(text)}</span></button>`;
  }

  _miniChips() {
    const p = this._prefix();
    const sp = `sensor.${p}`;
    const bp = `binary_sensor.${p}`;
    const chips = [];
    const total = this._value(`${sp}_regles_proxy`);
    const active = this._value(`${sp}_regles_actives`);
    chips.push(this._miniChip(`${sp}_regles_proxy`, "router", this._t("ruleCount").replace("{a}", active).replace("{n}", total), "ok"));
    // Certificates expiring within 30 days get a chip each, the closest first; otherwise one chip with their count.
    const expiring = this._certSensors(p)
      .filter(({ suffix, days }) => (days !== null && days < 30) || this._isOn(`${bp}_cert_expirant_${suffix}`))
      .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
    for (const { id, suffix, days } of expiring) {
      const domain = this._attr(id, "domain") || suffix.replace(/_/g, ".");
      const cls = days !== null && days < 7 ? "crit" : "warn";
      chips.push(this._miniChip(id, "cert", `${domain} · ${this._daysLabel(days)}`, cls, true));
    }
    if (!expiring.length) {
      chips.push(this._miniChip(`${sp}_certificats_tls`, "cert", this._t("certCount").replace("{n}", this._value(`${sp}_certificats_tls`)), "ok"));
    }
    chips.push(this._miniChip(`${sp}_port_entrant`, "web", `${this._t("port")} ${this._value(`${sp}_port_entrant`)}`, "idle"));
    // Controls only show when they need a look: HTTPS redirect off, development mode (no cache) on.
    // Exactly "off": unavailable or unknown is not "HTTPS redirect off".
    if (this._state(`${bp}_redirection_https`) === "off") {
      chips.push(this._miniChip(`${bp}_redirection_https`, "lock", `${this._t("httpsRedirect")} ${this._t("off")}`, "warn", true));
    }
    if (this._isOn(`${bp}_mode_developpement`)) {
      chips.push(this._miniChip(`${bp}_mode_developpement`, "code", `${this._t("devMode")} ${this._t("on")}`, "warn", true));
    }
    return chips.join("");
  }

  _render() {
    if (!this._hass || !this._config) return;
    const focus = this._focusKey();
    if (this._zoomed) this._draw();
    else this._renderMini();
    this._addZoom();
    this._restoreFocus(focus);
  }

  _renderMini() {
    this._snapshot();
    this.shadowRoot.innerHTML = `
      <style>${this.constructor.CSS}</style>
      <ha-card lang="${this._lang()}">
        <div class="mini">
          ${ZoraxyCard.LOGO}
          <div class="body">
            <div class="head">
              ${this._nameLink()}
              <span id="status">${this._statusChip(this._state(`binary_sensor.${this._prefix()}_proxy_actif`))}</span>
            </div>
            <div class="rs">${this._miniChips()}</div>
          </div>
        </div>
      </ha-card>`;
    this.shadowRoot.querySelectorAll(".r").forEach((el) => {
      el.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: el.dataset.entity }, bubbles: true, composed: true }));
      });
    });
  }

  // Detail button at the end of the header, top right in both views.
  _addZoom() {
    const head = this._config.zoom !== false && this.shadowRoot.querySelector(".head, .header");
    if (!head) return;
    const button = document.createElement("button");
    button.className = "zoom";
    button.title = this._t(this._zoomed ? "zoomOut" : "zoomIn");
    button.setAttribute("aria-label", button.title);
    button.innerHTML = this._mdi(ZoraxyCard.ICONS[this._zoomed ? "arrowCollapse" : "arrowExpand"]);
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._zoomed = !this._zoomed;
      this._render();
      // Keyboard use (Enter / Space: no click count) keeps the focus on the button that replaced this one.
      if (ev.detail === 0) this.shadowRoot.querySelector(".zoom")?.focus();
    });
    head.appendChild(button);
  }
}

// ── Editors ───────────────────────────────────────────────────────────────────
class ZoraxyCardEditor extends HTMLElement {
  static SCHEMA = [
    { name: "zoraxy_url", selector: { text: { type: "url" } } },
    { name: "entity_prefix", selector: { text: {} } },
  ];

  // The fields, then the language picker (its "Auto" label in the editor's language).
  static schema(t) {
    const options = [
      { value: "", label: t("lang_auto") },
      { value: "en", label: "English" },
      { value: "fr", label: "Français" },
      { value: "de", label: "Deutsch" },
      { value: "es", label: "Español" },
      { value: "sr", label: "Српски" },
      { value: "sr-Latn", label: "Srpski (latinica)" },
      { value: "it", label: "Italiano" },
      { value: "nl", label: "Nederlands" },
      { value: "pt", label: "Português (Portugal)" },
      { value: "pl", label: "Polski" },
    ];
    return [...this.SCHEMA, { name: "language", selector: { select: { mode: "dropdown", options } } }];
  }

  static DEFAULTS = { entity_prefix: "zoraxy_reverse_proxy_zoraxy" };

  setConfig(config) {
    this._config = Object.assign({}, config);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", this._valueChanged.bind(this));
      this.appendChild(this._form);
    }
    // The labels follow the language picked in the editor: rebuilt only when it changes.
    const lang = ZoraxyCard.langOfHass(this._hass, this._config);
    if (lang !== this._lang) {
      this._lang = lang;
      const t = (key) => ZoraxyCard.I18N[lang][key];
      this._form.schema = this.constructor.schema(t);
      this._form.computeLabel = (field) => t(`ed_${field.name}`) || field.name;
      this._form.computeHelper = (field) => t(`ed_${field.name}_helper`);
    }
    this._form.hass = this._hass;
    // Show the defaults as set, so the fields match what the card does.
    this._form.data = Object.assign({}, this.constructor.DEFAULTS, this._config);
  }

  _valueChanged(ev) {
    ev.stopPropagation();
    const value = Object.assign({}, ev.detail.value);
    // Keep the YAML short: drop options left empty or at their default.
    const defaults = this.constructor.DEFAULTS;
    Object.keys(defaults).forEach((key) => {
      if (value[key] === defaults[key]) delete value[key];
    });
    ["zoraxy_url", "entity_prefix", "language"].forEach((key) => { if (!value[key]) delete value[key]; });
    this._config = value;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: value }, bubbles: true, composed: true }));
  }
}

// The mini card's editor: the full card's fields, plus the detail button.
class ZoraxyMiniCardEditor extends ZoraxyCardEditor {
  static SCHEMA = [...ZoraxyCardEditor.SCHEMA, { name: "zoom", selector: { boolean: {} } }];
  static DEFAULTS = { ...ZoraxyCardEditor.DEFAULTS, zoom: true };
}

if (!customElements.get("zoraxy-card-editor")) {
  customElements.define("zoraxy-card-editor", ZoraxyCardEditor);
}
if (!customElements.get("zoraxy-mini-card-editor")) {
  customElements.define("zoraxy-mini-card-editor", ZoraxyMiniCardEditor);
}

// Each card is registered on its own: a page that already loaded an older copy of this file (a stale resource
// or a cached version without the mini card) still gets the mini card from this one.
window.customCards = window.customCards || [];
if (!customElements.get("zoraxy-card")) {
  customElements.define("zoraxy-card", ZoraxyCard);
  window.customCards.push({ type: "zoraxy-card", name: "Zoraxy Card", description: "Status, controls, certificates and proxy rules of a Zoraxy reverse proxy", preview: true, documentationURL: "https://github.com/juju35/ha-zoraxy" });
  console.info(`%c ZORAXY-CARD %c v${ZORAXY_CARD_VERSION} `, "color:#bfdbfe;background:#0f172a;font-weight:700", "color:#0f172a;background:#bfdbfe");
}
if (!customElements.get("zoraxy-mini-card")) {
  customElements.define("zoraxy-mini-card", ZoraxyMiniCard);
  window.customCards.push({ type: "zoraxy-mini-card", name: "Zoraxy Mini Card", description: "Zoraxy status, rules and certificate alerts on two lines, with a detail button showing the full card", preview: true, documentationURL: "https://github.com/juju35/ha-zoraxy" });
}
