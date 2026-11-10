import { Registrant, CardTemplate } from '../types';
import QRCode from 'qrcode';
import { storageService, getFridaysForMonth } from './storageService';
import { DEFAULT_CARD_TEMPLATE } from './cardTemplatePresets';

/**
 * Helper to wrap image loading into a promise with timeout and fallback
 */
function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || !src.trim()) return resolve(null);
    const img = new Image();
    // Only set crossOrigin for remote http(s) URLs to avoid security errors on data/blob URLs
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback attempt without crossOrigin if remote image failed
      if (img.crossOrigin) {
        const retry = new Image();
        retry.onload = () => resolve(retry);
        retry.onerror = () => resolve(null);
        retry.src = src;
      } else {
        resolve(null);
      }
    };
    // 3.5s timeout protection
    setTimeout(() => resolve(null), 3500);
    img.src = src;
  });
}

/**
 * Draws rounded rectangle path
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draws subtle watermark patterns on the canvas card base
 */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  patternType: CardTemplate['patternType'],
  x: number,
  y: number,
  w: number,
  h: number,
  strokeColor: string
) {
  if (patternType === 'none') return;

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = 1;

  if (patternType === 'crosses') {
    ctx.globalAlpha = 0.045;
    const step = 64;
    for (let px = x + 30; px < x + w - 20; px += step) {
      for (let py = y + 30; py < y + h - 20; py += step) {
        // Vertical beam
        ctx.beginPath();
        ctx.moveTo(px, py - 12);
        ctx.lineTo(px, py + 12);
        ctx.stroke();
        // Horizontal beam
        ctx.beginPath();
        ctx.moveTo(px - 8, py - 4);
        ctx.lineTo(px + 8, py - 4);
        ctx.stroke();
      }
    }
  } else if (patternType === 'geometric') {
    ctx.globalAlpha = 0.04;
    const step = 80;
    for (let px = x; px < x + w; px += step) {
      for (let py = y; py < y + h; py += step) {
        ctx.strokeRect(px, py, step * 0.7, step * 0.7);
        ctx.beginPath();
        ctx.arc(px + step * 0.35, py + step * 0.35, step * 0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (patternType === 'coptic_ornaments') {
    ctx.globalAlpha = 0.05;
    const step = 90;
    for (let px = x + 40; px < x + w - 30; px += step) {
      for (let py = y + 40; py < y + h - 30; py += step) {
        // Coptic equal-armed cross with ring
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 18, py);
        ctx.lineTo(px + 18, py);
        ctx.moveTo(px, py - 18);
        ctx.lineTo(px, py + 18);
        ctx.stroke();
      }
    }
  } else if (patternType === 'waves') {
    ctx.globalAlpha = 0.04;
    ctx.lineWidth = 1.5;
    for (let py = y + 40; py < y + h; py += 32) {
      ctx.beginPath();
      ctx.moveTo(x, py);
      for (let px = x; px < x + w; px += 40) {
        ctx.quadraticCurveTo(px + 10, py - 6, px + 20, py);
        ctx.quadraticCurveTo(px + 30, py + 6, px + 40, py);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Generates and downloads the official ID card front face as a high-resolution PNG image
 * Contains: Member Photo, Full Name, Unique ID Code, Meeting Name, Birth Date, Official QR Code, and Brand Ribbon.
 * Dynamically uses the active CardTemplate (colors, background image, gradients, borders, badge styling).
 */
export async function downloadIdCardFrontAsImage(
  registrant: Registrant,
  qrCodeDataUrl?: string,
  meetingLogoUrl?: string | null,
  customTemplate?: CardTemplate
): Promise<boolean> {
  try {
    const template: CardTemplate = customTemplate || storageService.getCardTemplate() || DEFAULT_CARD_TEMPLATE;

    // 0. Ensure fonts are loaded if available
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    // 1. Ensure QR Code Data URL is available with crisp resolution
    let qrDataUrl = qrCodeDataUrl;
    if (!qrDataUrl || !qrDataUrl.startsWith('data:image')) {
      qrDataUrl = await QRCode.toDataURL(registrant.uniqueCode, {
        width: 400,
        margin: 1,
        color: { dark: template.textColor || '#0f172a', light: '#ffffff' }
      });
    }

    // 2. Preload assets
    const effectiveLogoUrl = meetingLogoUrl && meetingLogoUrl.trim() !== ''
      ? meetingLogoUrl
      : '/assets/aistudio/1000762371-removebg-preview_e1bb979f.png';
    const [photoImg, qrImg, logoImg, customBgImg] = await Promise.all([
      loadImage(registrant.photoUrl),
      loadImage(qrDataUrl),
      loadImage(effectiveLogoUrl),
      template.customBgImageUrl ? loadImage(template.customBgImageUrl) : Promise.resolve(null)
    ]);

    // 3. Create high-resolution canvas (1200 x 760 px - Standard CR80 ratio)
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // Enable high quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Outer padding
    const p = 32;
    const cardW = canvas.width - p * 2;
    const cardH = canvas.height - p * 2;
    const cardR = template.borderRadius || 36;

    // Background Shadow & Card Base
    ctx.save();
    roundRect(ctx, p, p, cardW, cardH, cardR);
    ctx.clip();

    // Base background: solid or gradient
    if (template.bgType === 'solid') {
      ctx.fillStyle = template.bgGradientStart || '#ffffff';
      ctx.fillRect(p, p, cardW, cardH);
    } else {
      const bgGrad = ctx.createLinearGradient(p, p, p + cardW, p + cardH);
      bgGrad.addColorStop(0, template.bgGradientStart || '#ffffff');
      bgGrad.addColorStop(0.65, template.bgGradientStart || '#ffffff');
      bgGrad.addColorStop(1, template.bgGradientEnd || '#ecfdf5');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(p, p, cardW, cardH);
    }

    // Custom Background Image (if uploaded)
    if (customBgImg) {
      ctx.save();
      const bgOpacity = Math.min(Math.max(template.bgImageOpacity ?? 0.22, 0.05), 1.0);
      ctx.globalAlpha = bgOpacity;

      // Cover-fit background image inside card rectangle
      const imgAspect = customBgImg.width / customBgImg.height;
      const boxAspect = cardW / cardH;
      let rW = cardW;
      let rH = cardH;
      let rX = p;
      let rY = p;

      if (imgAspect > boxAspect) {
        rW = cardH * imgAspect;
        rX = p - (rW - cardW) / 2;
      } else {
        rH = cardW / imgAspect;
        rY = p - (rH - cardH) / 2;
      }

      ctx.drawImage(customBgImg, rX, rY, rW, rH);
      ctx.restore();

      // Color overlay tint if specified
      if (template.bgImageOverlayColor && template.bgImageOverlayColor !== 'transparent') {
        ctx.save();
        ctx.fillStyle = template.bgImageOverlayColor;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(p, p, cardW, cardH);
        ctx.restore();
      }
    }

    // Watermark Pattern
    drawPattern(
      ctx, 
      template.patternType || 'none', 
      p, 
      p, 
      cardW, 
      cardH, 
      template.primaryColor || '#047857'
    );

    // Decorative top accent band
    if (template.topBandStyle !== 'none') {
      const topBandGrad = ctx.createLinearGradient(p, p, p + cardW, p);
      if (template.topBandStyle === 'gold') {
        topBandGrad.addColorStop(0, '#b45309');
        topBandGrad.addColorStop(0.5, '#f59e0b');
        topBandGrad.addColorStop(1, '#fbbf24');
      } else if (template.topBandStyle === 'solid') {
        topBandGrad.addColorStop(0, template.primaryColor || '#047857');
        topBandGrad.addColorStop(1, template.primaryColor || '#047857');
      } else {
        topBandGrad.addColorStop(0, template.primaryColor || '#047857');
        topBandGrad.addColorStop(0.5, template.secondaryColor || '#059669');
        topBandGrad.addColorStop(1, template.accentColor || '#10b981');
      }
      ctx.fillStyle = topBandGrad;
      ctx.fillRect(p, p, cardW, 14);
    }

    // -------------------------------------------------------------
    // Header Section
    // -------------------------------------------------------------
    const headerY = p + 38;

    // Logo on right side of header
    const logoX = p + cardW - 88;
    const logoSize = 64;
    if (logoImg) {
      ctx.save();
      roundRect(ctx, logoX, headerY, logoSize, logoSize, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.clip();
      const scale = 1.28;
      const drawW = logoSize * scale;
      const drawH = logoSize * scale;
      const drawX = logoX - (drawW - logoSize) / 2;
      const drawY = headerY - (drawH - logoSize) / 2 + 4;
      ctx.drawImage(logoImg, drawX, drawY, drawW, drawH);
      ctx.restore();
      // Border around logo
      roundRect(ctx, logoX, headerY, logoSize, logoSize, 16);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();
    } else {
      // Default Logo Badge with Cross
      roundRect(ctx, logoX, headerY, logoSize, logoSize, 16);
      ctx.fillStyle = template.primaryColor || '#065f46';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✝️', logoX + logoSize / 2, headerY + logoSize / 2);
    }

    // Meeting titles (RTL aligned next to logo)
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    ctx.fillStyle = template.textColor || '#0f172a';
    ctx.font = '900 32px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('اجتماع شباب الثلاثة فتية', logoX - 18, headerY + 28);

    ctx.fillStyle = template.primaryColor || '#047857';
    ctx.font = '700 20px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('اجتماع الشباب السوداني', logoX - 18, headerY + 58);

    // Unique Code Badge on Top Left
    const badgeW = 160;
    const badgeH = 46;
    const badgeX = p + 40;
    const badgeY = headerY + 8;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 23);
    ctx.fillStyle = template.badgeBgColor || '#ecfdf5';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = template.badgeBorderColor || '#a7f3d0';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = template.badgeTextColor || '#065f46';
    ctx.font = '900 22px monospace';
    ctx.fillText(registrant.uniqueCode, badgeX + badgeW / 2, badgeY + 30);

    // Header separator line
    const sepY = headerY + logoSize + 22;
    ctx.beginPath();
    ctx.moveTo(p + 35, sepY);
    ctx.lineTo(p + cardW - 35, sepY);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = template.textColor === '#f8fafc' ? 'rgba(255,255,255,0.15)' : '#e2e8f0';
    ctx.stroke();

    // -------------------------------------------------------------
    // Content Columns:
    // Left side: Photo portrait (330px wide x 430px tall)
    // Right side: Member Information & QR code
    // -------------------------------------------------------------
    const photoW = 330;
    const photoH = 430;
    const photoX = p + 45;
    const photoY = sepY + 22;
    const photoR = 26;

    // Draw Portrait Photo on Left inside isolated clipped sub-canvas
    ctx.save();
    roundRect(ctx, photoX, photoY, photoW, photoH, photoR);
    ctx.clip();

    if (photoImg) {
      // Cover fit photo inside portrait box
      const imgAspect = photoImg.width / photoImg.height;
      const boxAspect = photoW / photoH;
      let renderW = photoW;
      let renderH = photoH;
      let renderX = photoX;
      let renderY = photoY;

      if (imgAspect > boxAspect) {
        renderW = photoH * imgAspect;
        renderX = photoX - (renderW - photoW) / 2;
      } else {
        renderH = photoW / imgAspect;
        renderY = photoY - (renderH - photoH) / 2;
      }
      ctx.drawImage(photoImg, renderX, renderY, renderW, renderH);
    } else {
      // Fallback gray background with silhouette
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 72px "Cairo", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👤', photoX + photoW / 2, photoY + photoH / 2);
    }
    // Restore clipping state immediately after photo
    ctx.restore();

    // Photo Outline
    roundRect(ctx, photoX, photoY, photoW, photoH, photoR);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = template.borderColor || '#059669';
    ctx.stroke();

    // -------------------------------------------------------------
    // Right Side: Member Information & QR Code
    // -------------------------------------------------------------
    const infoRightX = p + cardW - 48;
    const availableTextWidth = infoRightX - (photoX + photoW + 40);

    // 1. Full Name Label & Value
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    ctx.fillStyle = template.subtextColor || '#94a3b8';
    ctx.font = '700 19px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('الاسم بالكامل', infoRightX, photoY + 26);

    const cardDisplayName = registrant.role === 'priest'
      ? (registrant.fullName.startsWith('أبونا') ? registrant.fullName : `أبونا ${registrant.fullName}`)
      : registrant.fullName;

    // Dynamically scale font size if member name is long to prevent wrapping issues
    let nameFontSize = 40;
    ctx.font = `900 ${nameFontSize}px "Cairo", "Noto Sans Arabic", sans-serif`;
    while (ctx.measureText(cardDisplayName).width > availableTextWidth && nameFontSize > 24) {
      nameFontSize -= 2;
      ctx.font = `900 ${nameFontSize}px "Cairo", "Noto Sans Arabic", sans-serif`;
    }
    ctx.fillStyle = template.textColor || '#0f172a';
    ctx.fillText(cardDisplayName, infoRightX, photoY + 74);

    // 2. Date of Birth with Calendar Icon
    let currentInfoY = photoY + 124;
    ctx.textAlign = 'right';
    ctx.fillStyle = template.primaryColor || '#047857';
    ctx.font = '700 23px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText(`📅  الميلاد: ${registrant.dob || 'غير محدد'}`, infoRightX, currentInfoY);

    // 3. Church Meeting Affiliation
    currentInfoY += 38;
    // Indicator dot
    ctx.beginPath();
    ctx.arc(infoRightX - 6, currentInfoY - 8, 6, 0, Math.PI * 2);
    ctx.fillStyle = template.accentColor || '#10b981';
    ctx.fill();

    ctx.fillStyle = template.textColor === '#f8fafc' ? '#e2e8f0' : '#334155';
    ctx.font = '700 22px "Cairo", "Noto Sans Arabic", sans-serif';
    const affiliationText = registrant.role === 'priest' 
      ? 'كاهن الاجتماع ✝️' 
      : 'اجتماع الثلاثة فتية القديسين';
    ctx.fillText(affiliationText, infoRightX - 22, currentInfoY);

    // 4. Member Address if provided
    const hasAddress = Boolean(registrant.address && registrant.address.trim());
    if (hasAddress) {
      currentInfoY += 34;
      ctx.fillStyle = template.subtextColor || '#475569';
      ctx.font = '600 20px "Cairo", "Noto Sans Arabic", sans-serif';
      const cleanAddr = registrant.address!.trim();
      let displayAddr = cleanAddr;
      if (ctx.measureText(`📍 العنوان: ${cleanAddr}`).width > availableTextWidth) {
        displayAddr = cleanAddr.slice(0, 36) + '...';
      }
      ctx.fillText(`📍 العنوان: ${displayAddr}`, infoRightX, currentInfoY);
    }

    // -------------------------------------------------------------
    // 5. Official Attendance Barcode & QR Code Section
    // -------------------------------------------------------------
    const qrBoxY = hasAddress ? currentInfoY + 20 : currentInfoY + 28;
    const qrSize = 180;
    const qrX = infoRightX - qrSize;

    // QR Code Frame
    roundRect(ctx, qrX, qrBoxY, qrSize, qrSize, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = template.qrBorderColor || template.borderColor || '#059669';
    ctx.stroke();

    if (qrImg) {
      // Draw crisp QR code with 10px inner padding
      ctx.drawImage(qrImg, qrX + 10, qrBoxY + 10, qrSize - 20, qrSize - 20);
    }

    // Official Code Details beside QR Code
    const textNextToQrX = qrX - 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = template.subtextColor || '#64748b';
    ctx.font = '700 21px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('كود الحضور الرسمي', textNextToQrX, qrBoxY + 60);

    ctx.fillStyle = template.primaryColor || '#065f46';
    ctx.font = '900 38px monospace';
    ctx.fillText(registrant.uniqueCode, textNextToQrX, qrBoxY + 115);

    // -------------------------------------------------------------
    // 6. Footer Ribbon
    // -------------------------------------------------------------
    const footerY = p + cardH - 36;
    ctx.beginPath();
    ctx.moveTo(p + 35, footerY - 16);
    ctx.lineTo(p + cardW - 35, footerY - 16);
    ctx.lineWidth = 1;
    ctx.strokeStyle = template.textColor === '#f8fafc' ? 'rgba(255,255,255,0.15)' : '#e2e8f0';
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = template.subtextColor || '#64748b';
    ctx.font = '700 17px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('اجتماع الثلاثة فتية القديسين • السوداني', infoRightX, footerY + 8);

    ctx.textAlign = 'left';
    ctx.fillStyle = template.primaryColor || '#047857';
    ctx.font = '900 17px monospace';
    ctx.fillText('THE THREE YOUTHS • SUDANESE YOUTH', p + 45, footerY + 8);

    ctx.restore(); // Restore outer card clip

    // Outer Border Frame
    roundRect(ctx, p, p, cardW, cardH, cardR);
    ctx.lineWidth = template.borderWidth || 3.5;
    ctx.strokeStyle = template.borderColor || '#059669';
    ctx.stroke();

    // 7. Convert to Blob & Download File
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    const safeName = (registrant.fullName || 'عضو').trim().replace(/[\s/\\?%*:|"<>]/g, '_');
    link.download = `بطاقة_عضوية_أمامي_${safeName}_${registrant.uniqueCode}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
      } catch {}
    }, 300);

    return true;
  } catch (err) {
    console.error('Failed to export card image:', err);
    return false;
  }
}

/**
 * Generates a high-resolution PNG image of ONLY the Back Face (Friday Attendance Stamps)
 * of the ID card with normal orientation (zero CSS rotateY mirror distortion).
 */
export async function downloadIdCardBackAsImage(
  registrant: Registrant,
  meetingLogoUrl?: string | null,
  customTemplate?: CardTemplate
): Promise<boolean> {
  try {
    const template = customTemplate || storageService.getCardTemplate() || DEFAULT_CARD_TEMPLATE;

    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1200))
      ]);
    }

    const width = 1080;
    const height = 680;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.direction = 'rtl';

    const p = 18;
    const cardW = width - p * 2;
    const cardH = height - p * 2;
    const cardR = Math.round((template.borderRadius || 32) * 1.4);

    // 1. Card Shadow & White Base
    ctx.save();
    roundRect(ctx, p, p, cardW, cardH, cardR);
    ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // Clip to card interior
    ctx.save();
    roundRect(ctx, p, p, cardW, cardH, cardR);
    ctx.clip();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p, p, cardW, cardH);

    // Subtle watermark cross in center background
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 240px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✝', width / 2, height / 2);
    ctx.restore();

    // Top Accent Ribbon
    const topRibbonGrad = ctx.createLinearGradient(p, p, p + cardW, p);
    topRibbonGrad.addColorStop(0, template.primaryColor || '#059669');
    topRibbonGrad.addColorStop(0.5, template.accentColor || '#10b981');
    topRibbonGrad.addColorStop(1, template.primaryColor || '#059669');
    ctx.fillStyle = topRibbonGrad;
    ctx.fillRect(p, p, cardW, 12);

    // 2. Back Header ("🕊️ اجتماع شباب الثلاثة فتية ✝️" & "الاسم: ...")
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 36px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('🕊️  اجتماع شباب الثلاثة فتية  ✝️', width / 2, p + 68);

    ctx.fillStyle = '#334155';
    ctx.font = '800 26px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText(`الاسم: ${registrant.fullName}`, width / 2, p + 114);

    // Dotted underline under name
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 220, p + 126);
    ctx.lineTo(width / 2 + 220, p + 126);
    ctx.stroke();
    ctx.restore();

    // Header separator line
    ctx.beginPath();
    ctx.moveTo(p + 40, p + 144);
    ctx.lineTo(p + cardW - 40, p + 144);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f1f5f9';
    ctx.stroke();

    // 3. Promotional Challenge Banner
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();
    const monthFridays = getFridaysForMonth(currentYear, currentMonthIndex);
    const monthlyAttendance = storageService.getMemberMonthlyAttendance(registrant.id, currentYear, currentMonthIndex);

    const bannerW = 680;
    const bannerH = 54;
    const bannerX = (width - bannerW) / 2;
    const bannerY = p + 162;

    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 27);
    ctx.fillStyle = '#ecfdf5';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a7f3d0';
    ctx.stroke();

    ctx.fillStyle = '#065f46';
    ctx.font = '800 24px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🎁 احضر ${monthFridays.length} جمعات بدون غياب و ليك هدية`, width / 2, bannerY + 36);

    // 4. The 4 or 5 Friday Circles (RTL order)
    const effectiveLogoSrc = meetingLogoUrl || storageService.getCustomLogo() || '/assets/aistudio/1000762371-removebg-preview_e1bb979f.png';
    const logoImg = await loadImage(effectiveLogoSrc);

    const count = monthFridays.length;
    const gridMarginX = 70;
    const totalGridW = cardW - gridMarginX * 2;
    const slotW = totalGridW / count;
    const circleCenterY = p + 345;
    const circleRadius = count === 5 ? 72 : 82;

    monthFridays.forEach((friday, idx) => {
      // RTL position: idx 0 on the right
      const centerX = (p + cardW - gridMarginX) - slotW * idx - slotW / 2;
      const status = monthlyAttendance.fridayStatusMap[friday.fridayIndex];
      const isStamped = Boolean(status?.isAttended);
      const dateText = friday.formattedDate;

      // Circle background & border
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, circleCenterY, circleRadius, 0, Math.PI * 2);
      if (isStamped) {
        ctx.fillStyle = 'rgba(239, 246, 255, 0.7)';
        ctx.fill();
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#2563eb';
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.setLineDash([10, 7]);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#93c5fd';
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (isStamped) {
        if (logoImg) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, circleCenterY - 8, circleRadius - 14, 0, Math.PI * 2);
          ctx.clip();
          const imgSize = (circleRadius - 14) * 1.75;
          ctx.drawImage(logoImg, centerX - imgSize / 2, circleCenterY - 8 - imgSize / 2, imgSize, imgSize);
          ctx.restore();
        }
        // Stamped badge inside bottom of circle
        const innerBadgeW = 90;
        const innerBadgeH = 26;
        roundRect(ctx, centerX - innerBadgeW / 2, circleCenterY + circleRadius - 36, innerBadgeW, innerBadgeH, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#93c5fd';
        ctx.stroke();

        ctx.direction = 'ltr';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1e3a8a';
        ctx.font = '900 15px monospace';
        ctx.fillText(`(${dateText}) ✓`, centerX, circleCenterY + circleRadius - 18);
        ctx.direction = 'rtl';
      } else {
        // Empty circle spot showing (dd/mm)
        ctx.direction = 'ltr';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 22px monospace';
        ctx.fillText(`(${dateText})`, centerX, circleCenterY + 8);
        ctx.direction = 'rtl';
      }

      // Gift icon on final circle of the month
      if (friday.fridayIndex === monthFridays.length) {
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎁', centerX + circleRadius * 0.68, circleCenterY - circleRadius * 0.68);
      }

      // Date pill strictly in (dd/mm) format underneath the circle
      const pillW = 104;
      const pillH = 34;
      const pillX = centerX - pillW / 2;
      const pillY = circleCenterY + circleRadius + 16;

      roundRect(ctx, pillX, pillY, pillW, pillH, 10);
      ctx.fillStyle = isStamped ? '#dbeafe' : '#f8fafc';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isStamped ? '#bfdbfe' : '#e2e8f0';
      ctx.stroke();

      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = isStamped ? '#1e3a8a' : '#94a3b8';
      ctx.font = '900 19px monospace';
      ctx.fillText(`(${dateText})`, centerX, pillY + 24);
      ctx.direction = 'rtl';
    });

    // 5. Attendance Progress Summary Line
    const summaryY = p + 525;
    ctx.textAlign = 'center';
    if (monthlyAttendance.isCompletedAllFridays) {
      ctx.fillStyle = '#047857';
      ctx.font = '800 22px "Cairo", "Noto Sans Arabic", sans-serif';
      ctx.fillText(
        `✅ تم إكمال جميع جمعات الشهر (${monthFridays.length}) بنجاح! هديتك في الانتظار 🎁`,
        width / 2,
        summaryY
      );
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '700 22px "Cairo", "Noto Sans Arabic", sans-serif';
      ctx.fillText(
        `حضور هذا الشهر: ${monthlyAttendance.attendedFridaysCount} من ${monthFridays.length} جمعات`,
        width / 2,
        summaryY
      );
    }

    // 6. Back Footer Ribbon ("👥 شباب الكنيسة" | "🎁 @3fetya_youth" | "ختم الاجتماع")
    const footerY = p + cardH - 36;
    ctx.beginPath();
    ctx.moveTo(p + 35, footerY - 22);
    ctx.lineTo(p + cardW - 35, footerY - 22);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f1f5f9';
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 20px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('👥 شباب الكنيسة', p + cardW - 45, footerY + 8);

    // Center @3fetya_youth pill
    const handleW = 220;
    const handleH = 38;
    roundRect(ctx, width / 2 - handleW / 2, footerY - 18, handleW, handleH, 19);
    ctx.fillStyle = '#ecfdf5';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#a7f3d0';
    ctx.stroke();

    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#065f46';
    ctx.font = '900 19px monospace';
    ctx.fillText('🎁 @3fetya_youth', width / 2, footerY + 7);
    ctx.direction = 'rtl';

    ctx.textAlign = 'left';
    ctx.fillStyle = '#059669';
    ctx.font = '800 20px "Cairo", "Noto Sans Arabic", sans-serif';
    ctx.fillText('ختم الاجتماع', p + 45, footerY + 8);

    ctx.restore(); // Restore card clip

    // Outer Border Frame
    roundRect(ctx, p, p, cardW, cardH, cardR);
    ctx.lineWidth = template.borderWidth || 3.5;
    ctx.strokeStyle = template.borderColor || '#059669';
    ctx.stroke();

    // 7. Download PNG File
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    const safeName = (registrant.fullName || 'عضو').trim().replace(/[\s/\\?%*:|"<>]/g, '_');
    link.download = `بطاقة_عضوية_خلفي_${safeName}_${registrant.uniqueCode}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
      } catch {}
    }, 300);

    return true;
  } catch (err) {
    console.error('Failed to export back card image:', err);
    return false;
  }
}

/**
 * Downloads the ID card image dynamically matching the currently displayed face ('front' | 'back' | 'both').
 */
export async function downloadIdCardAsImage(
  registrant: Registrant,
  activeFace: 'front' | 'back' | 'both',
  qrCodeDataUrl?: string,
  meetingLogoUrl?: string | null,
  customTemplate?: CardTemplate
): Promise<boolean> {
  if (activeFace === 'back') {
    return downloadIdCardBackAsImage(registrant, meetingLogoUrl, customTemplate);
  }
  return downloadIdCardFrontAsImage(registrant, qrCodeDataUrl, meetingLogoUrl, customTemplate);
}

