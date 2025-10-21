// ----------------------------------------
// ⚙️ Cấu hình Tag ưu tiên
// ----------------------------------------

// ----------------------------------------
// 📥 Lấy dữ liệu giả lập từ local file
// ----------------------------------------
let CRM_DATA = [];
let VIEW_DATA = [];
let VIEW_DEGREE = [];
let ACCOUNT_DATA;
const compareState = {
  range1: "last_7days",
  range2: "previous_7days",
  custom1: null,
  custom2: null,
  data1: null,
  data2: null,
};
function waitForOTP() {
  return new Promise((resolve, reject) => {
    const container = document.querySelector(".dom_accounts");
    const overlay = document.querySelector(".dom_accounts_overlay");
    const confirmBtn = document.getElementById("view_report");
    const otpInput = document.getElementById("access_token");

    if (!container || !confirmBtn || !otpInput || !overlay) {
      return reject("Không tìm thấy các thành phần UI OTP");
    }

    container.classList.add("active");
    overlay.classList.add("active");

    const handler = () => {
      const otp = otpInput.value.trim();
      if (!otp) {
        alert("Vui lòng nhập OTP!");
        return;
      }
      container.classList.remove("active");
      overlay.classList.remove("active");
      confirmBtn.removeEventListener("click", handler);
      resolve(otp);
    };

    confirmBtn.addEventListener("click", handler);
  });
}

async function loginFlow(username, password) {
  // STEP 1: login để lấy temp token
  const formData1 = new FormData();
  formData1.append("Username", username);
  formData1.append("Password", password);

  const res1 = await fetch("https://ideas.edu.vn/login_otp.php?step=login", {
    method: "POST",
    body: formData1,
  });
  const data1 = await res1.json();
  console.log("Step 1 response:", data1);

  // Nếu không có temp token mà có EmployeeCode => bỏ qua OTP
  if (!data1.Data?.AccessToken?.Token) {
    if (data1.Data?.User?.EmployeeCode) {
      console.log("Không có temp token, nhưng có EmployeeCode → qua Step 3");
      return await doStep3();
    }
    throw new Error("Không nhận được temp token và không có EmployeeCode!");
  }

  // STEP 2: nhập OTP
  const tempToken = data1.Data.AccessToken.Token;
  const otp = await waitForOTP();

  const formData2 = new FormData();
  formData2.append("OTP", otp);
  formData2.append("Token", tempToken);

  const res2 = await fetch("https://ideas.edu.vn/login_otp.php?step=otp", {
    method: "POST",
    body: formData2,
  });
  const data2 = await res2.json();
  console.log("Step 2 response:", data2);

  if (!data2.Success) throw new Error(data2.UserMessage || "Login thất bại!");

  // STEP 3: Lấy token CRM chính
  return await doStep3();
}
// 🔹 Hàm Step 3 tách riêng để tái sử dụng
async function doStep3() {
  const res3 = await fetch("https://ideas.edu.vn/login_otp.php?step=crm", {
    method: "POST",
  });
  const data3 = await res3.json();
  console.log("Step 3 response:", data3);

  const token = data3.Data?.token;
  const refresh_token = data3.Data?.refresh_token;

  if (!token) throw new Error("Không lấy được token CRM!");

  localStorage.setItem("misa_token", token);
  localStorage.setItem("misa_refresh_token", refresh_token);

  return { token, refresh_token };
}

async function quickLogin() {
  const response = await fetch("https://ideas.edu.vn/login_otp.php?step=crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  const token = data?.Data?.token;

  if (token) {
    localStorage.setItem("misa_token", token);
    console.log("✅ Token quickLogin đã được lưu");
    return token;
  }

  console.warn("⚠️ Không tìm thấy token trong quickLogin:", data);
  return null;
}

async function getToken(username, password, forceLogin = false) {
  if (!forceLogin) {
    let token = localStorage.getItem("misa_token");
    if (token) return token;

    const quick = await quickLogin();
    if (quick) return quick;
  }

  const fullLogin = await loginFlow(username, password);
  if (fullLogin?.token) return fullLogin.token;

  const manual = prompt("Nhập token MISA:");
  if (!manual) throw new Error("Không có token MISA");
  localStorage.setItem("misa_token", manual);
  return manual;
}
// ========================= FETCH LEAD DATA (no delay) =========================
async function fetchLeadData(from, to, token) {
  // const url = `./data.json?from_date=${from}&to_date=${to}&token=${token}`;
  const url = `https://ideas.edu.vn/proxy_misa.php?from_date=${from}&to_date=${to}&token=${token}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });

      if (res.status === 401 || res.status === 403) {
        // Token chưa hợp lệ hoặc hết hạn
        console.warn(`❌ Token bị từ chối (${res.status}) ở lần ${attempt}`);
        localStorage.removeItem("misa_token");
        return [];
      }

      if (!res.ok) {
        console.warn(`⚠️ Lỗi HTTP ${res.status}, thử lại (${attempt}/3)`);
        continue; // Thử lại nếu lỗi tạm thời
      }

      const json = await res.json();

      // Có data thì trả về luôn
      if (json?.data?.length) {
        console.log(`📦 Nhận ${json.data.length} leads (attempt ${attempt})`);
        return json.data;
      }

      // Không có data nhưng không lỗi → có thể backend chưa sync kịp
      console.log(`ℹ️ Attempt ${attempt}: data rỗng, thử lại ngay...`);
      continue;
    } catch (err) {
      console.error(`⚠️ Lỗi network attempt ${attempt}:`, err);
      continue;
    }
  }

  console.error("❌ Hết 3 lượt gọi mà không có dữ liệu hợp lệ");
  return [];
}
async function fetchLeads(from, to) {
  let data = null;
  let token = null;

  try {
    // 1️⃣ Ưu tiên token trong localStorage hoặc quickLogin
    token = await getToken("numt@ideas.edu.vn", "Ideas123456");
    console.log("🔑 Token hiện tại:", token.slice(0, 20) + "...");

    // 2️⃣ Gọi API chính
    data = await fetchLeadData(from, to, token);

    // 🟡 Nếu có phản hồi OK nhưng data rỗng → có thể token cũ hết hạn
    if (Array.isArray(data) && data.length === 0) {
      console.warn("⚠️ Token local có thể hết hạn → thử xoá và quickLogin lại...");
      localStorage.removeItem("misa_token");

      const quick = await quickLogin();
      if (quick) {
        token = quick;
        data = await fetchLeadData(from, to, token);
      }
    }

    // 3️⃣ Nếu vẫn không có dữ liệu, thử login đầy đủ (OTP)
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn("⚠️ quickLogin không ra data → loginFlow bằng OTP...");
      localStorage.removeItem("misa_token");

      token = await getToken("numt@ideas.edu.vn", "Ideas123456", true);
      data = await fetchLeadData(from, to, token);
    }

    // 4️⃣ Nếu vẫn không có dữ liệu
    if (!data?.length) {
      console.error("❌ Không có dữ liệu sau mọi cách!");
      alert("IDEAS CRM không có phản hồi hoặc token bị lỗi!");
    } else {
      console.log(`✅ Đã tải ${data.length} leads`);
      CRM_DATA = data;
    }
  } catch (err) {
    console.error("🚨 Lỗi fetchLeads:", err);
    alert("Không thể kết nối đến IDEAS CRM!");
  }

  return data || [];
}


// async function fetchLeads(from, to) {
//   const loading = document.querySelector(".loading");
//   loading.classList.add("active");

//   let data = null;
//   let token = "Test";

//   try {
//     // 1️⃣ Lấy token (ưu tiên localStorage hoặc quickLogin)
//     // token = await getToken("numt@ideas.edu.vn", "Ideas123456");
//     // console.log("🔑 Token hiện tại:", token.slice(0, 20) + "...");

//     // 2️⃣ Gọi API chính
//     data = await fetchLeadData(from, to, token);

//     // 3️⃣ Nếu token cũ lỗi hoặc API báo unauthorized → tự login lại
//     if (!data?.length) {
//       console.warn("⚠️ Token có thể hết hạn → login lại bằng forceLogin...");

//       localStorage.removeItem("misa_token");
//       token = await getToken("numt@ideas.edu.vn", "Ideas123456", true);
//       data = await fetchLeadData(from, to, token);
//     }

//     // 4️⃣ Nếu vẫn không có dữ liệu → cảnh báo người dùng
//     if (!data?.length) {
//       console.error("❌ Không có dữ liệu sau khi login lại!");
//       alert("IDEAS CRM không có phản hồi hoặc token bị lỗi!");
//     } else {
//       console.log(`✅ Đã tải ${data.length} leads`);
//       CRM_DATA = data;
//     }
//   } catch (err) {
//     console.error("🚨 Lỗi fetchLeads:", err);
//     alert("Không thể kết nối đến IDEAS CRM!");
//   } finally {
//     loading.classList.remove("active");
//   }

//   return data || [];
// }

function getTagsArray(tagText) {
  if (!tagText) return [];
  return tagText
    .split(",")
    .map((t) => t.trim().replace(/^0\.\s*/g, "")) // bỏ tiền tố "0."
    .filter(Boolean);
}

function getPrimaryTag(tags, priorityList) {
  if (!tags || tags.length === 0) return "Untag"; // 🆕 gán Untag khi không có tag
  for (const p of priorityList) {
    if (tags.some((t) => t.includes(p))) return p;
  }
  return "Untag";
}

// ----------------------------------------
// 🧩 Xử lý dữ liệu chính
// ----------------------------------------
const tagPriority = [
  "Needed",
  "Qualified",
  "Considering",
  "Bad timing",
  "Unqualified",
  "Junk",
  "New",
  "Untag",
];

// ----------------------------------------
// 🚀 Chạy thử
// ----------------------------------------
let RAW_DATA = [];
let GROUPED = {};
let leadChartInstance = null;
let currentTagFilter = "Needed"; // ✅ mặc định filter chart theo tag này
const currentFilter = { campaign: null, source: null, medium: null };

// ----------------------------------------
// 🚀 Main
// ----------------------------------------

async function main() {
  performance.mark("start_main");
  const items = document.querySelectorAll(".dom_dashboard .dom_fade_item");

  
  const initRange = getDateRange("last_7days");
  const dateText = document.querySelector(".dom_date");
  dateText.textContent = formatDisplayDate(initRange.from, initRange.to);

  document.querySelector(".loading")?.classList.add("active");

  const t0 = performance.now();
  RAW_DATA = await fetchLeads(initRange.from, initRange.to);
  console.log(`✅ FetchLeads done in ${(performance.now() - t0).toFixed(1)}ms`);

  await processAndRenderAll(RAW_DATA, true);
  setupTimeDropdown();
  setupCompareDropdowns();
  setupAccountFilter();
  setupClearFilter();
  setupQualityFilter();
  setupLeadSearch();
  setupDropdowns();
  setupTagClick();
initSaleDetailClose();
  // setupSaleAIReportButton();
  performance.mark("end_main");
  console.log(
    "⏱ Total main():",
    performance.measure("main_total", "start_main", "end_main")
  );
  document.querySelector(".loading")?.classList.remove("active");
  items.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add("show");
    }, i * 150); // mỗi cái cách nhau 100ms
  });
}

// ✅ Gọi init để đảm bảo token xong mới chạy main
(async () => {
  console.time("⏱ DOM Dashboard Loaded");
  await main();
  console.timeEnd("⏱ DOM Dashboard Loaded");
})();

function generateAdvancedReport(RAW_DATA) {
  if (!GROUPED || !Array.isArray(RAW_DATA)) {
    console.warn("generateAdvancedReport: Dữ liệu đầu vào không hợp lệ.");
    return;
  }

  // 🧩 Gom grouped theo chi nhánh
  const buildGroupedForOrg = (orgKeyword) => {
    const orgData = RAW_DATA.filter(
      (l) => (l.CustomField16Text || "").trim().toUpperCase() === orgKeyword
    );
    return { data: orgData, grouped: processCRMData(orgData) };
  };

  const ideas = buildGroupedForOrg("IDEAS");
  const vtci = buildGroupedForOrg("VTCI");

  // 🧠 Tạo báo cáo riêng từng bên
  const ideasReport = makeDeepReport(ideas.grouped, ideas.data, "IDEAS");
  const vtciReport = makeDeepReport(vtci.grouped, vtci.data, "VTCI");

  // 🗓️ Lấy ngày hiển thị
  const dateText =
    document.querySelector(".dom_date")?.textContent?.trim() || "";

  // 🧱 Render HTML vào khu vực báo cáo
  const reportWrap = document.querySelector(".dom_ai_report");
  if (!reportWrap)
    return console.warn("Không tìm thấy .dom_ai_report trong DOM.");

  // Cập nhật tiêu đề ngày
  const title = reportWrap.querySelector("h3");
  if (title)
    title.innerHTML = `
   <p><img src="./logotarget.png">
      <span>CRM LEAD REPORT </span></p>
      ${dateText ? `<p class="report_time">${dateText}</p>` : ""}
    `;

  // Render nội dung báo cáo
  const content = reportWrap.querySelector(".dom_ai_report_content");
  if (content) {
    content.innerHTML = `
      <div class="ai_report_block ideas">
        <h4> <img src="https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp"/>IDEAS - CRM Data</h4>
        <div class="ai_report_inner">${ideasReport}</div>
      </div>
      <div class="ai_report_block vtci">
        <h4> <img src="https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp"/>VTCI - CRM Data</h4>
        <div class="ai_report_inner">${vtciReport}</div>
      </div>
    `;
  }

  console.log("✅ Đã render báo cáo AI cho IDEAS & VTCI.");
}
async function generateSaleReportAI(SALE_DATA, saleName = "SALE") {
  if (!Array.isArray(SALE_DATA) || !SALE_DATA.length) {
    alert("⚠️ Không có dữ liệu để phân tích!");
    return;
  }

  const GROUPED = processCRMData(SALE_DATA);
  const reportHTML = makeSaleAIReport(GROUPED, SALE_DATA, saleName);

  // 🗓️ Lấy thời gian hiển thị từ DOM
  const dateText =
    document.querySelector(".dom_date")?.textContent?.trim() || "";

  // ✅ Cập nhật title trong .dom_ai_report
  const title = document.querySelector(".dom_ai_report h3");
  if (title)
    title.innerHTML = `
    <p><img src="./logotarget.png">
      <span>REPORT ${saleName}</span></p>
      ${dateText ? `<p class="report_time">${dateText}</p>` : ""}
    `;

  // ✅ Render nội dung báo cáo
  const wrap = document.querySelector(".dom_ai_report_content");
  if (!wrap) return console.warn("Không tìm thấy .dom_ai_report_content");

  wrap.innerHTML = `
    <div class="ai_report_block sale active">
      <div class="ai_report_inner">${reportHTML}</div>
    </div>
  `;

  // ✅ Hiệu ứng fade-in
  setTimeout(() => {
    wrap
      .querySelectorAll(".fade_in_item")
      .forEach((el, i) => setTimeout(() => el.classList.add("show"), i * 200));
  }, 3000);

  console.log(`✅ Đã render báo cáo AI cho ${saleName}`);
}

// =================================================
// 🧠 HÀM PHÂN TÍCH CHUYÊN SÂU CHO MỘT SALE
// =================================================
function makeSaleAIReport(GROUPED, DATA, saleName = "SALE") {
  if (!GROUPED?.byTag || !DATA?.length)
    return `<p class="warn">⚠️ Không có dữ liệu cho ${saleName}.</p>`;

  const totalLeads = DATA.length;
  const goodTagRe = /Needed|Considering/i;
  const totalQuality = DATA.filter((l) => goodTagRe.test(l.TagMain)).length;
  const qualityRateTotal = ((totalQuality / totalLeads) * 100).toFixed(1);

  // === Logo chiến dịch ===
  const logos = [
    {
      match: /facebook|fb/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Logo_de_Facebook.png/1200px-Logo_de_Facebook.png",
    },
    {
      match: /google/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png",
    },
    {
      match: /tiktok/i,
      url: "https://www.logo.wine/a/logo/TikTok/TikTok-Icon-White-Dark-Background-Logo.wine.svg",
    },
    {
      match: /linkedin/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/1024px-LinkedIn_icon.svg.png",
    },
    {
      match: /zalo/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Zalo_logo_2021.svg/512px-Zalo_logo_2021.svg.png",
    },
    {
      match: /ideas/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    },
    {
      match: /vtci/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    },
  ];
  const defaultLogo =
    "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp";
  const getLogo = (text = "") => {
    const t = text.toLowerCase();
    for (const l of logos) if (l.match.test(t)) return l.url;
    return defaultLogo;
  };

  // === Tag phổ biến ===
  const totalByTag = Object.entries(GROUPED.byTag)
    .map(([tag, arr]) => ({ tag, count: arr.length }))
    .sort((a, b) => b.count - a.count);
  const topTag = totalByTag[0];
  const tagPercent = (v) => ((v / totalLeads) * 100).toFixed(1);
  const tagHTML = totalByTag
    .map(
      (t) =>
        `<li>${t.tag}: <b>${t.count}</b> (${(
          (t.count / totalLeads) *
          100
        ).toFixed(1)}%)</li>`
    )
    .join("");

  // === Degree (đếm từ VIEW_DEGREE) ===
  const degreeHTML = Object.entries(VIEW_DEGREE || {})
    .filter(([_, v]) => v > 0) // ⚡ chỉ lấy mục có giá trị > 0
    .map(
      ([k, v]) =>
        `<li>${k}: <b>${v}</b> (${((v / totalLeads) * 100).toFixed(1)}%)</li>`
    )
    .join("");

  // === Chiến dịch ===
  const campaignStats = [];
  for (const [camp, srcs] of Object.entries(GROUPED.byCampaign)) {
    for (const [src, meds] of Object.entries(srcs)) {
      for (const [med, arr] of Object.entries(meds)) {
        const total = arr.length;
        const quality = arr.filter((l) => goodTagRe.test(l.TagMain)).length;
        campaignStats.push({
          campaign: camp,
          source: src,
          medium: med,
          total,
          quality,
          qualityRate: (quality / total) * 100,
        });
      }
    }
  }
  const topByVolume = campaignStats.reduce((a, b) =>
    b.total > a.total ? b : a
  );
  const top3Quality = campaignStats
    .filter((c) => c.total > 5)
    .sort((a, b) => b.qualityRate - a.qualityRate)
    .slice(0, 3);

  // === Theo ngày ===
  const dates = Object.entries(GROUPED.byDate)
    .map(([d, v]) => ({ d, total: v.total }))
    .sort((a, b) => a.d.localeCompare(b.d));
  const avgPerDay = (totalLeads / (dates.length || 1)).toFixed(1);
  const trend =
    dates.length > 2
      ? dates.at(-1).total > dates.at(-2).total
        ? "Lead tăng so với hôm qua."
        : "Lead giảm so với hôm qua."
      : "";
  const peakDay = dates.reduce((a, b) => (b.total > a.total ? b : a), {
    d: "",
    total: 0,
  });

  // === Nhận định chuyên sâu ===
  const insightItems = [];
  if (qualityRateTotal < 20)
    insightItems.push(
      `Tỷ lệ lead chất lượng thấp (${qualityRateTotal}%) — cần cải thiện quy trình tư vấn hoặc kịch bản follow-up.`
    );
  else if (qualityRateTotal < 45)
    insightItems.push(
      `Tỷ lệ lead trung bình (${qualityRateTotal}%) — có thể tối ưu thêm nội dung tư vấn hoặc thời gian phản hồi.`
    );
  else
    insightItems.push(
      `Tỷ lệ lead chất lượng cao (${qualityRateTotal}%) — hiệu suất tư vấn đang rất tốt.`
    );

  insightItems.push(
    `Ngày cao điểm: <b>${peakDay.d || "N/A"}</b> (${peakDay.total} leads).`
  );

  if (top3Quality[0])
    insightItems.push(
      `Chiến dịch hiệu quả nhất: <b>${
        top3Quality[0].campaign
      }</b> (${top3Quality[0].qualityRate.toFixed(1)}% Qualified).`
    );

  const insightHTML = insightItems.map((i) => `<li>${i}</li>`).join("");

  // === Render (giống UI makeDeepReport) ===
  const renderCampaignItem = (c, i) => `
    <li>
      <div class="camp_item">
        <div class="camp_logo"><img src="${getLogo(
          c.campaign + c.source
        )}" alt=""></div>
        <div class="camp_info">
          <p class="camp_name"><strong>${i + 1}. ${c.campaign}</strong></p>
          <p class="camp_source">${c.source} / ${c.medium}</p>
        </div>
        <div class="camp_stats">
          <span class="camp_total">${c.total}</span> leads
          <span class="camp_quality">(${c.qualityRate.toFixed(
            1
          )}% Qualified)</span>
        </div>
      </div>
    </li>`;

  return `
  <section class="ai_section fade_in_block">
    <h5 class="fade_in_item delay-1"><i class="fa-solid fa-users"></i> Lead Overview</h5>
    <ul class="fade_in_item delay-2">
      <li><strong>Tổng số lead:</strong> <b>${totalLeads.toLocaleString(
        "vi-VN"
      )}</b></li>
      <li><strong>Trung bình mỗi ngày:</strong> <b>${avgPerDay}</b></li>
      <li><strong>Tỷ lệ lead chất lượng:</strong> <b>${qualityRateTotal}%</b></li>
      <li><strong>Tag phổ biến nhất:</strong> <b>${
        topTag.tag
      }</b> (${tagPercent(topTag.count)}%)</li>
    </ul>

    <h5 class="fade_in_item delay-3"><i class="fa-solid fa-tags"></i> Phân loại Tag</h5>
    <ul class="fade_in_item delay-4">${tagHTML}</ul>

    <h5 class="fade_in_item delay-5"><i class="fa-solid fa-graduation-cap"></i> Học vấn</h5>
    <ul class="fade_in_item delay-6">${degreeHTML}</ul>

    <h5 class="fade_in_item delay-7"><i class="fa-solid fa-bullhorn"></i> Hiệu quả chiến dịch</h5>
    <ul class="ai_campaign_list fade_in_item delay-8">
      <li class="camp_top_volume">
        <div class="camp_item top">
          <div class="camp_logo"><img src="${getLogo(
            topByVolume.campaign + topByVolume.source
          )}" alt=""></div>
          <div class="camp_info">
            <p class="camp_name"><strong>Top Lead:</strong> ${
              topByVolume.campaign
            }</p>
            <p class="camp_source">${topByVolume.source} / ${
    topByVolume.medium
  }</p>
          </div>
          <div class="camp_stats">
            <span class="camp_total">${topByVolume.total}</span> leads
            <span class="camp_quality">(${topByVolume.qualityRate.toFixed(
              1
            )}% Qualified)</span>
          </div>
        </div>
      </li>
      <li><strong>Top chiến dịch hiệu quả (Qualified%)</strong></li>
      ${top3Quality.map(renderCampaignItem).join("")}
    </ul>

    <h5 class="fade_in_item delay-9"><i class="fa-solid fa-chart-line"></i> Phân tích & Nhận định</h5>
    <ul class="fade_in_item delay-10 insight_list">${insightHTML}</ul>
  </section>`;
}

// Gắn sự kiện sau khi DOM đã render xong (ví dụ trong main hoặc sau render filter)
function setupSaleAIReportButton() {
  const btn = document.querySelector(".ai_report_sale");
  if (!btn) return console.warn("Không tìm thấy nút .ai_report_sale");

  btn.onclick = (e) => {
    if (!Array.isArray(VIEW_DATA) || !VIEW_DATA.length) {
      alert("⚠️ Không có dữ liệu để phân tích báo cáo AI!");
      return;
    }

    // Lấy tên sale hiện tại
    const activeSaleEl = document.querySelector(
      ".saleperson_detail .dom_selected"
    );
    const saleName =
      activeSaleEl?.textContent?.trim() || VIEW_DATA[0]?.OwnerIDText || "Sale";

    // Overlay loading
    // const overlay = document.querySelector(".dom_overlay_ai");
    // if (overlay) {
    //   overlay.classList.add("active");
    //   overlay.innerHTML =
    //     '<h5><i class="fa-solid fa-robot fa-spin"></i> Đang phân tích dữ liệu AI...</h5>';
    // }

    // Gọi hàm chính sau 300ms (giả lập delay nhỏ)
    generateSaleReportAI(VIEW_DATA, saleName);

    const panel = document.querySelector(".dom_ai_report");
    if (!panel) return;

    // Kích hoạt panel hiển thị
    panel.classList.add("active");
    // Cuộn lên đầu (giống generateAdvancedReport)
    panel.scrollTop = 0;
  };
}

// =====================================================
// 🧠 HÀM PHÂN TÍCH CHUYÊN SÂU CHO MỘT CHI NHÁNH
// =====================================================
const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/);
  return ((parts.at(-1)?.[0] || "") + (parts[0]?.[0] || "")).toUpperCase();
};
const getColorFromName2 = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360},70%,65%)`;
};
function makeDeepReport(GROUPED, DATA, orgName = "ORG") {
  if (!GROUPED?.byOwner || !DATA?.length)
    return `<p class="warn">⚠️ Không có dữ liệu cho ${orgName}.</p>`;

  // === Tổng hợp cơ bản ===
  const totalLeads = DATA.length;
  const totalByTag = Object.entries(GROUPED.byTag)
    .map(([tag, arr]) => ({ tag, count: arr.length }))
    .sort((a, b) => b.count - a.count);
  const topTag = totalByTag[0];
  const tagPercent = (v) => ((v / totalLeads) * 100).toFixed(1);

  // === Trung bình lead/ngày ===
  const dates = Object.entries(GROUPED.byDate)
    .map(([d, obj]) => ({ d, total: obj.total }))
    .sort((a, b) => a.d.localeCompare(b.d));
  const days = dates.length || 1;
  const avgPerDay = (totalLeads / days).toFixed(1);
  const trend =
    days > 2
      ? dates.at(-1).total > dates.at(-2).total
        ? "Lead đang tăng so với hôm qua."
        : "Lead giảm so với hôm qua."
      : "";

  // === Logo chiến dịch ===
  const logos = [
    {
      match: /facebook|fb/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Logo_de_Facebook.png/1200px-Logo_de_Facebook.png",
    },
    {
      match: /google/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png",
    },
    {
      match: /tiktok/i,
      url: "https://www.logo.wine/a/logo/TikTok/TikTok-Icon-White-Dark-Background-Logo.wine.svg",
    },
    {
      match: /linkedin/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/1024px-LinkedIn_icon.svg.png",
    },
    {
      match: /zalo/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Zalo_logo_2021.svg/512px-Zalo_logo_2021.svg.png",
    },
    {
      match: /Other - Web VTCI/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    },
    {
      match: /Other - Web IDEAS/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    },
  ];
  const defaultLogo =
    "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp";
  const getLogo = (text = "") => {
    const t = text.toLowerCase();
    for (const l of logos) if (l.match.test(t)) return l.url;
    return defaultLogo;
  };

  // === Helper: Avatar & màu ===

  // === Chiến dịch ===
  const goodTagRe = /Needed|Considering/i;
  const campaignStats = [];
  for (const [camp, sources] of Object.entries(GROUPED.byCampaign)) {
    for (const [src, mediums] of Object.entries(sources)) {
      for (const [medium, arr] of Object.entries(mediums)) {
        let quality = 0;
        for (const l of arr) if (goodTagRe.test(l.TagMain)) quality++;
        const total = arr.length;
        campaignStats.push({
          campaign: camp,
          source: src,
          medium,
          total,
          quality,
          qualityRate: (quality / total) * 100,
        });
      }
    }
  }

  const topByVolume = campaignStats.reduce((a, b) =>
    b.total > a.total ? b : a
  );
  const top3Quality = campaignStats
    .filter((c) => c.total > 5)
    .sort((a, b) => b.qualityRate - a.qualityRate)
    .slice(0, 3);

  // === Sale ===
  const saleStats = Object.entries(GROUPED.byOwner).map(([owner, data]) => {
    const good = Object.values(data.tags)
      .flatMap((t) => t.leads)
      .filter((l) => goodTagRe.test(l.TagMain)).length;
    return {
      owner,
      total: data.total,
      quality: good,
      qualityRate: (good / data.total) * 100,
    };
  });

  const topSaleByVolume = saleStats.reduce((a, b) =>
    b.total > a.total ? b : a
  );
  const topSaleByQuality = saleStats.reduce((a, b) =>
    b.qualityRate > a.qualityRate ? b : a
  );
  const lowSaleByQuality = saleStats.reduce((a, b) =>
    b.qualityRate < a.qualityRate ? b : a
  );

  // === Thống kê bổ sung ===
  const junkCount = DATA.filter((l) =>
    /junk|spam|test/i.test(l.TagMain)
  ).length;
  const junkRate = ((junkCount / totalLeads) * 100).toFixed(1);
  const saleGap = (
    topSaleByQuality.qualityRate - lowSaleByQuality.qualityRate
  ).toFixed(1);
  const peakDay = dates.reduce((a, b) => (b.total > a.total ? b : a), {
    d: "",
    total: 0,
  });
  const avg = totalLeads / days;
  const variance =
    dates.reduce((sum, d) => sum + Math.pow(d.total - avg, 2), 0) / days;
  const stability = 100 - Math.min(100, (Math.sqrt(variance) / avg) * 100);

  // === Tổng thể ===
  const totalQuality = DATA.filter((l) => goodTagRe.test(l.TagMain)).length;
  const qualityRateTotal = ((totalQuality / totalLeads) * 100).toFixed(1);

  // === Insight dạng UL–LI ===
  const insightItems = [];

  // 🎯 Tổng thể lead
  if (qualityRateTotal < 20)
    insightItems.push(
      `Tỷ lệ lead tổng thể thấp (${qualityRateTotal}%) — cần xem lại tệp đối tượng quảng cáo.`
    );
  else if (qualityRateTotal <= 45)
    insightItems.push(
      `Tỷ lệ lead trung bình (${qualityRateTotal}%) — có thể cải thiện thêm bằng tối ưu kênh quảng cáo.`
    );
  else
    insightItems.push(
      `Tỷ lệ lead chất lượng cao (${qualityRateTotal}%) — dữ liệu hiệu suất quảng cáo đang tốt.`
    );

  // 🧹 Lead rác
  if (junkRate > 15)
    insightItems.push(
      `Lead rác chiếm ${junkRate}% — cần điều chỉnh target hoặc thay đổi chiến dịch.`
    );

  // ⚖️ So sánh Sale cao - thấp
  insightItems.push(
    `Độ chênh lệch hiệu suất giữa <strong>${
      topSaleByQuality.owner
    } (${topSaleByQuality.qualityRate.toFixed(1)}%)</strong> và <strong>${
      lowSaleByQuality.owner
    } (${lowSaleByQuality.qualityRate.toFixed(
      1
    )}%)</strong> là <strong>${saleGap}%</strong>.`
  );

  // 📈 Ngày cao điểm
  insightItems.push(`Ngày cao điểm: ${peakDay.d} (${peakDay.total} leads).`);

  // 📊 Chỉ số ổn định (có đánh giá định tính)
  let stabilityText = "ổn định tốt";
  if (stability < 50)
    stabilityText = "chưa ổn định (dao động mạnh giữa các ngày)";
  else if (stability < 80) stabilityText = "tương đối ổn định";
  insightItems.push(
    `Chỉ số ổn định chiến dịch: <strong>${stability.toFixed(
      1
    )}%</strong> — ${stabilityText}.`
  );

  // 🚀 Chiến dịch hiệu quả nhất
  if (top3Quality[0]) {
    const c = top3Quality[0];
    insightItems.push(
      `Chiến dịch hiệu quả nhất: <strong>${
        c.campaign
      }</strong> — <strong>${c.qualityRate.toFixed(1)}% Qualified</strong> (${
        c.quality
      }/${c.total} leads đủ chuẩn).`
    );
  }

  // 💎 Sale nổi bật
  insightItems.push(
    `Sale nổi bật: <strong>${
      topSaleByQuality.owner
    }</strong> (${topSaleByQuality.qualityRate.toFixed(1)}%).`
  );

  const insightHTML = insightItems.map((i) => `<li>${i}</li>`).join("");

  // === Render ===
  const renderCampaignItem = (c, i) => `
    <li>
      <div class="camp_item">
        <div class="camp_logo"><img src="${getLogo(
          c.campaign + c.source
        )}" alt=""></div>
        <div class="camp_info">
          <p class="camp_name"><strong>${i + 1}. ${c.campaign}</strong></p>
          <p class="camp_source">${c.source} / ${c.medium}</p>
        </div>
        <div class="camp_stats">
          <span class="camp_total">${c.total}</span> leads
          <span class="camp_quality">(${c.qualityRate.toFixed(
            1
          )}% Qualified)</span>
        </div>
      </div>
    </li>`;

  const renderSaleItem = (s, label) => `
    <li>
      <div class="sale_item">
        <div class="sale_avatar" style="background:${getColorFromName2(
          s.owner
        )}">${getInitials(s.owner)}</div>
        <div class="sale_info">
          <p><strong>${label}:</strong> ${s.owner}</p>
          <p class="sale_stats">${s.total} leads – ${s.qualityRate.toFixed(
    1
  )}% Qualified</p>
        </div>
      </div>
    </li>`;

  return `
  <section class="ai_section fade_in_block">
    <h5 class="fade_in_item delay-1"><i class="fa-solid fa-users"></i> Lead</h5>
    <ul class="fade_in_item delay-2">
      <li><strong><i class="fa-solid fa-caret-right"></i> Tổng số lead:</strong> <b>${totalLeads.toLocaleString(
        "vi-VN"
      )}</b></li>
      <li><strong><i class="fa-solid fa-caret-right"></i> Trung bình mỗi ngày:</strong> <b>${avgPerDay} leads/ngày</b></li>
      <li><strong><i class="fa-solid fa-caret-right"></i> Tỷ lệ lead chất lượng:</strong> <b>${qualityRateTotal}%</b></li>
      <li><strong><i class="fa-solid fa-caret-right"></i> Tag phổ biến nhất:</strong> <b>${
        topTag.tag
      } (${tagPercent(topTag.count)}%)</b></li>
    </ul>

    <h5 class="fade_in_item delay-3"><i class="fa-solid fa-bullhorn"></i> Hiệu quả chiến dịch</h5>
    <ul class="ai_campaign_list fade_in_item delay-4">
      <li class="camp_top_volume">
        <div class="camp_item top">
          <div class="camp_logo"><img src="${getLogo(
            topByVolume.campaign + topByVolume.source
          )}" alt=""></div>
          <div class="camp_info">
            <p class="camp_name"><strong>Top Lead:</strong> ${
              topByVolume.campaign
            }</p>
            <p class="camp_source">${topByVolume.source} / ${
    topByVolume.medium
  }</p>
          </div>
          <div class="camp_stats">
            <span class="camp_total">${topByVolume.total}</span> leads
            <span class="camp_quality">(${topByVolume.qualityRate.toFixed(
              1
            )}% Qualified)</span>
          </div>
        </div>
      </li>
      <li><strong>Top chiến dịch hiệu quả (Qualified%)</strong></li>
      ${top3Quality.map(renderCampaignItem).join("")}
    </ul>

    <h5 class="fade_in_item delay-5"><i class="fa-solid fa-user-tie"></i> Đội ngũ Sale</h5>
    <ul class="ai_sale_list fade_in_item delay-6">
      ${renderSaleItem(topSaleByVolume, "Nhiều lead nhất")}
      ${renderSaleItem(topSaleByQuality, "Chất lượng cao nhất")}
    </ul>

    <h5 class="fade_in_item delay-7"><i class="fa-solid fa-chart-line"></i> Xu hướng</h5>
    <p class="fade_in_item delay-8">${trend}</p>

    <h5 class="fade_in_item delay-9"><i class="fa-solid fa-chart-simple"></i> Phân tích & Nhận định</h5>
    <ul class="fade_in_item delay-10 insight_list">${insightHTML}</ul>
  </section>`;
}

async function processAndRenderAll(data, isLoad) {
  VIEW_DATA = data;
  if (!data?.length) return;

  const t0 = performance.now();

  GROUPED = await processCRMData(data);
  if (isLoad) {
    ACCOUNT_DATA = GROUPED;
  }
  console.log(`🧩 Data processed in ${(performance.now() - t0).toFixed(1)}ms`);

  queueMicrotask(() => renderChartsSmoothly(GROUPED));
  requestAnimationFrame(() => {
    renderLeadTable(data);
    renderFilterOptions(GROUPED);
    renderSaleFilter(GROUPED);
  });
}

// 🧠 Hàm render chart chia nhỏ batch – không chặn main thread
function renderChartsSmoothly(GROUPED) {
  console.log(GROUPED);

  const chartTasks = [
    () => renderLeadTrendChart(GROUPED),
    () => renderLeadQualityMeter(GROUPED),
    () => renderCampaignPieChart(GROUPED),
    () => renderToplist(GROUPED),
    () => renderToplistBySale(GROUPED),
    () => renderTagFrequency(GROUPED),
    () => renderProgramChart(GROUPED),
    () => renderLeadTagChart(GROUPED),
    () => renderDegreeChart(GROUPED),
  ];

  let idx = 0;
  const total = chartTasks.length;

  const next = () => {
    if (idx >= total) return;
    const task = chartTasks[idx++];

    // Dùng requestIdleCallback nếu có, fallback sang RAF
    if ("requestIdleCallback" in window) {
      requestIdleCallback(
        () => {
          task();
          requestAnimationFrame(next);
        },
        { timeout: 200 }
      );
    } else {
      setTimeout(() => {
        task();
        next();
      }, 40);
    }
  };

  // ⚡ Start nhanh chart đầu tiên
  queueMicrotask(() => {
    chartTasks[0]?.();
    idx = 1;
    next();
  });
}
function processCRMData(data) {
  if (!data?.length)
    return {
      byDate: Object.create(null),
      byCampaign: Object.create(null),
      byOwner: Object.create(null),
      byTag: Object.create(null),
      byTagAndDate: Object.create(null),
      byOrg: Object.create(null),
      tagFrequency: Object.create(null),
    };

  // ⚙️ Chuẩn bị cache & biến cục bộ cho tốc độ cao
  const r = {
    byDate: Object.create(null),
    byCampaign: Object.create(null),
    byOwner: Object.create(null),
    byTag: Object.create(null),
    byTagAndDate: Object.create(null),
    byOrg: Object.create(null),
    tagFrequency: Object.create(null),
  };

  const len = data.length;
  const tagPriorityLocal = tagPriority || [];
  const getTagsArrayLocal = getTagsArray;
  const getPrimaryTagLocal = getPrimaryTag;

  // ⚡ Duyệt nhanh — dùng biến tạm, hạn chế truy cập sâu & GC
  const BATCH = 3000;
  let i = 0;

  function processBatch() {
    const end = Math.min(i + BATCH, len);
    for (; i < end; i++) {
      const lead = data[i];
      const created = lead.CreatedDate;
      const date = created ? created.slice(0, 10) : "Unknown";

      // === Chuẩn bị dữ liệu nhanh ===
      const tags = getTagsArrayLocal(lead.TagIDText);
      let mainTag = getPrimaryTagLocal(tags, tagPriorityLocal) || "Untag";
      if (mainTag === "Qualified") mainTag = "Needed";
      if (tags.length === 0) tags.push("Untag");
      lead.TagMain = mainTag;

      const org = lead.CustomField16Text || "Org";
      const campaign = lead.CustomField13Text || "Campaign";
      const source = lead.CustomField14Text || "Source";
      const medium = lead.CustomField15Text || "Medium";

      const ownerFull = lead.OwnerIDText || "No Owner";
      const ownerKey = ownerFull.replace(/\s*\(NV.*?\)\s*/gi, "").trim();

      // ==== 1️⃣ tagFrequency ====
      const tagLen = tags.length;
      for (let j = 0; j < tagLen; j++) {
        const tag = tags[j];
        r.tagFrequency[tag] = (r.tagFrequency[tag] || 0) + 1;
      }

      // ==== 2️⃣ byDate ====
      const dateObj = (r.byDate[date] ||= { total: 0 });
      dateObj.total++;
      dateObj[mainTag] = (dateObj[mainTag] || 0) + 1;

      // ==== 3️⃣ byTag ====
      (r.byTag[mainTag] ||= []).push(lead);

      // ==== 4️⃣ byTagAndDate ====
      const tagMap = (r.byTagAndDate[mainTag] ||= Object.create(null));
      (tagMap[date] ||= []).push(lead);

      // ==== 5️⃣ byCampaign ====
      (((r.byCampaign[campaign] ||= Object.create(null))[source] ||=
        Object.create(null))[medium] ||= []).push(lead);

      // ==== 6️⃣ byOwner ====
      const ownerObj = (r.byOwner[ownerKey] ||= {
        total: 0,
        tags: Object.create(null),
        leads: [],
      });
      ownerObj.total++;
      ownerObj.leads.push(lead);

      const ownerTag = (ownerObj.tags[mainTag] ||= { count: 0, leads: [] });
      ownerTag.count++;
      ownerTag.leads.push(lead);

      // ==== 7️⃣ byOrg ====
      const orgObj = (r.byOrg[org] ||= {
        total: 0,
        tags: Object.create(null),
        owners: Object.create(null),
        byDate: Object.create(null),
      });
      orgObj.total++;
      (orgObj.tags[mainTag] ||= []).push(lead);
      (orgObj.owners[ownerKey] ||= []).push(lead);
      (orgObj.byDate[date] ||= []).push(lead);
    }

    if (i < len) {
      // 🔹 Nhường thread cho browser trước khi xử lý batch tiếp theo
      setTimeout(processBatch, 0);
    }
  }

  // 🚀 Bắt đầu xử lý theo batch (tránh block UI)
  processBatch();

  return r;
}

document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".dom_menu li");
  const container = document.querySelector(".dom_container");

  menuItems.forEach((li) => {
    li.addEventListener("click", () => {
      // 🟡 Bỏ active cũ
      menuItems.forEach((item) => item.classList.remove("active"));

      // 🟢 Active cái được chọn
      li.classList.add("active");

      // 🧹 Xóa tất cả class view cũ trong container
      container.classList.forEach((cls) => {
        // chỉ xóa nếu nó trùng với data-view của menu
        if (["dashboard", "sale", "compare", "won"].includes(cls)) {
          container.classList.remove(cls);
        }
      });

      // 🚀 Thêm class mới tương ứng (theo data-view)
      const view = li.getAttribute("data-view");
      container.classList.add(view);
    });
  });
});
function resetToFirstMenu() {
  const menuItems = document.querySelectorAll(".dom_menu li");
  const container = document.querySelector(".dom_container");
  if (!menuItems.length || !container) return;
  menuItems.forEach((i) => i.classList.remove("active"));
  const first = menuItems[0];
  first.classList.add("active");
  container.classList.forEach((cls) => {
    if (["dashboard", "sale", "compare", "won"].includes(cls))
      container.classList.remove(cls);
  });
  const view = first.getAttribute("data-view");
  if (view) container.classList.add(view);
}

function renderSaleFilter(grouped) {
  setupSaleQualityDropdown(grouped);
  setupLeadTagChartBySale(grouped);
  renderToplistBySale(grouped);
  renderLeadSaleChart(grouped, "Needed");
}
// ============================
// RENDER FILTERS
// ============================
function renderFilterOptions(grouped) {
  const campaignSelect = document.querySelector(
    ".dom_select.campaign ul.dom_select_show"
  );
  const sourceSelect = document.querySelector(
    ".dom_select.source ul.dom_select_show"
  );
  const mediumSelect = document.querySelector(
    ".dom_select.medium ul.dom_select_show"
  );

  campaignSelect.innerHTML = "";
  sourceSelect.innerHTML = "";
  mediumSelect.innerHTML = "";

  // ✅ 1️⃣ Campaign luôn render theo dữ liệu gốc (RAW_DATA)
  const groupedAll = ACCOUNT_DATA;
  for (const [campaign, sources] of Object.entries(groupedAll.byCampaign)) {
    const total = Object.values(sources)
      .flatMap((s) => Object.values(s))
      .flat().length;
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
       <span> <span>${campaign}</span>
        <span class="count">${total}</span></span>`;
    li.onclick = () => applyFilter("campaign", campaign);
    campaignSelect.appendChild(li);
  }

  // ✅ 2️⃣ Source & Medium chỉ render từ dữ liệu hiện tại (GROUPED)
  // --- Sources ---
  const sourcesMap = {};
  for (const sources of Object.values(grouped.byCampaign)) {
    for (const [src, mediums] of Object.entries(sources)) {
      sourcesMap[src] =
        (sourcesMap[src] || 0) + Object.values(mediums).flat().length;
    }
  }
  for (const [src, count] of Object.entries(sourcesMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
        <span> <span>${src}</span>
        <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("source", src);
    sourceSelect.appendChild(li);
  }

  // --- Mediums ---
  const mediumMap = {};
  for (const sources of Object.values(grouped.byCampaign)) {
    for (const mediums of Object.values(sources)) {
      for (const [m, leads] of Object.entries(mediums)) {
        mediumMap[m] = (mediumMap[m] || 0) + leads.length;
      }
    }
  }
  for (const [m, count] of Object.entries(mediumMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
        <span> <span>${m}</span>
        <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("medium", m);
    mediumSelect.appendChild(li);
  }
}
function setupQualityFilter() {
  const qualitySelect = document.querySelector(".dom_select.quality");
  if (!qualitySelect) return;

  const toggle = qualitySelect.querySelector(".flex");
  const list = qualitySelect.querySelector("ul.dom_select_show");
  const selectedEl = qualitySelect.querySelector(".dom_selected");
  const allItems = list.querySelectorAll("li");

  // 🟡 Toggle mở/đóng dropdown (click bất kỳ trong vùng .dom_select)
  qualitySelect.onclick = (e) => {
    e.stopPropagation();
    const isActive = list.classList.contains("active");

    // Đóng các dropdown khác
    document
      .querySelectorAll(".dom_select_show")
      .forEach((ul) => ul !== list && ul.classList.remove("active"));

    // Toggle dropdown hiện tại
    list.classList.toggle("active", !isActive);
  };

  // 🟢 Chọn tag
  allItems.forEach((li) => {
    li.onclick = (e) => {
      e.stopPropagation();
      const tag = li.querySelector("span:nth-child(2)").textContent.trim();

      const isCurrentlyActive = li.classList.contains("active");

      // Nếu click lại chính item đang active → chỉ đóng dropdown
      if (isCurrentlyActive) {
        list.classList.remove("active");
        return;
      }

      // Reset UI active
      allItems.forEach((el) => el.classList.remove("active"));
      list
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));

      // Đánh dấu item được chọn
      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      // Cập nhật nhãn hiển thị
      selectedEl.textContent = tag;

      // Cập nhật chart (giữ nguyên grouped data hiện tại)
      renderLeadTrendChart(GROUPED, tag);

      // Đóng dropdown sau khi chọn
      list.classList.remove("active");
    };
  });

  // 🔹 Click ra ngoài thì đóng dropdown
  document.addEventListener("click", (e) => {
    if (!qualitySelect.contains(e.target)) list.classList.remove("active");
  });
}

// ============================
// RENDER SOURCE + MEDIUM (theo Campaign hoặc full)
// ============================
function renderSourceAndMedium(selectedCampaign = null) {
  // Nếu không truyền campaign → render All Source + All Medium
  const sourceSelect = document.querySelector(
    ".dom_select.source ul.dom_select_show"
  );
  const mediumSelect = document.querySelector(
    ".dom_select.medium ul.dom_select_show"
  );
  sourceSelect.innerHTML = "";
  mediumSelect.innerHTML = "";

  const campaignsToUse = selectedCampaign
    ? { [selectedCampaign]: grouped.byCampaign[selectedCampaign] }
    : grouped.byCampaign;

  const sourcesMap = {};
  const mediumMap = {};

  for (const sources of Object.values(campaignsToUse)) {
    for (const [src, mediums] of Object.entries(sources)) {
      sourcesMap[src] =
        (sourcesMap[src] || 0) + Object.values(mediums).flat().length;
      for (const [m, leads] of Object.entries(mediums)) {
        mediumMap[m] = (mediumMap[m] || 0) + leads.length;
      }
    }
  }

  // Render Source
  for (const [src, count] of Object.entries(sourcesMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
       <span>
        <span>${src}</span>
        <span class="count">${count}</span>
       </span>`;
    li.onclick = () => {
      applyFilter("source", src);
      renderMedium(selectedCampaign, src);
    };
    sourceSelect.appendChild(li);
  }

  // Render Medium
  for (const [m, count] of Object.entries(mediumMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
       <span> <span>${m}</span>
        <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("medium", m);
    mediumSelect.appendChild(li);
  }
}

// ============================
// RENDER MEDIUM (khi chọn source cụ thể)
// ============================
function renderMedium(selectedCampaign, selectedSource) {
  const mediumSelect = document.querySelector(
    ".dom_select.medium ul.dom_select_show"
  );
  mediumSelect.innerHTML = "";

  const campaignData = selectedCampaign
    ? grouped.byCampaign[selectedCampaign]
    : grouped.byCampaign;
  const sources = selectedSource
    ? { [selectedSource]: campaignData[selectedSource] }
    : campaignData;

  const mediumMap = {};

  if (currentFilter.source && !currentFilter.campaign) {
    // ✅ Chỉ chọn Source, chưa chọn Campaign → quét tất cả campaign
    for (const sources of Object.values(GROUPED.byCampaign)) {
      if (!sources[currentFilter.source]) continue;
      const mediums = sources[currentFilter.source];
      for (const [m, leads] of Object.entries(mediums)) {
        mediumMap[m] = (mediumMap[m] || 0) + leads.length;
      }
    }
  } else {
    // ✅ Bình thường (đã chọn Campaign hoặc không chọn gì)
    for (const sources of Object.values(GROUPED.byCampaign)) {
      for (const mediums of Object.values(sources)) {
        for (const [m, leads] of Object.entries(mediums)) {
          mediumMap[m] = (mediumMap[m] || 0) + leads.length;
        }
      }
    }
  }

  for (const [m, count] of Object.entries(mediumMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="radio_box"></span>
      <span><span>${m}</span>
      <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("medium", m);
    mediumSelect.appendChild(li);
  }
}
function setActiveRadio(type, value) {
  const list = document.querySelector(`.dom_select.${type} ul.dom_select_show`);
  list.querySelectorAll("li").forEach((li) => {
    const name = li.querySelector("span:nth-child(2)").textContent;
    const radio = li.querySelector(".radio_box");
    const isActive = name === value;
    li.classList.toggle("active", isActive);
    radio.classList.toggle("active", isActive);
  });
}

// ============================
// APPLY FILTER + UI ACTIVE
// ============================
function applyFilter(type, value) {
  currentFilter[type] = value;

  // Reset filter con nếu đổi filter cha
  if (type === "campaign") {
    currentFilter.source = null;
    currentFilter.medium = null;
  }
  if (type === "source") {
    currentFilter.medium = null;
  }

  // Cập nhật UI hiển thị
  document.querySelector(`.dom_select.${type} .dom_selected`).textContent =
    value;
  setActiveRadio(type, value);
  setSourceActive();
  // 1️⃣ Lọc lại dữ liệu theo bộ lọc hiện tại
  const filtered = filterLeadsBySelection(RAW_DATA);

  // 2️⃣ Process lại với dữ liệu đã lọc

  processAndRenderAll(filtered);
  // 3️⃣ Render lại các bộ lọc (con)

  // 4️⃣ Log kết quả / render bảng nếu cần
  console.log("✅ Filtered & regrouped data:", GROUPED);
}

// ============================
// FILTER DATA LOGIC
// ============================
function setupLeadSearch() {
  const input = document.querySelector(".dom_search");
  const btn = document.getElementById("find_data");

  if (!input || !btn) return;

  btn.onclick = () => applyLeadSearch();
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") applyLeadSearch();
  });

  function applyLeadSearch() {
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) {
      // ❌ Nếu trống → render lại toàn bộ
      renderLeadTable(RAW_DATA);
      return;
    }

    // ✅ Lọc theo số điện thoại hoặc tên sale
    const filtered = RAW_DATA.filter((lead) => {
      const phone = lead.Mobile?.toLowerCase() || "";
      const owner = lead.OwnerIDText?.toLowerCase() || "";
      return phone.includes(keyword) || owner.includes(keyword);
    });

    // 🧮 Render lại bảng với dữ liệu lọc
    renderLeadTable(filtered);

    // Nếu không có kết quả thì báo
    if (filtered.length === 0) {
      const container = document.querySelector(".dom_table_box");
      if (container)
        container.innerHTML = `
            <div class="dom_table_container empty">
              <p>Không tìm thấy dữ liệu phù hợp cho "<b>${keyword}</b>"</p>
            </div>
          `;
    }
  }
}

function setupLeadTagChartBySale(grouped) {
  const selectWrap = document.querySelector(".dom_select.sale_tag_chart");
  if (!selectWrap) return;

  const dropdown = selectWrap.querySelector(".dom_select_show");
  const selected = selectWrap.querySelector(".dom_selected");
  const searchInput = document.querySelector(".dom_search");
  if (!grouped?.byOwner) return;

  // 🧮 Danh sách sale (ẩn mã NV)
  const sales = Object.keys(grouped.byOwner).map((n) =>
    n.replace(/\s*\(NV.*?\)/gi, "").trim()
  );
  const defaultSale = sales[0];

  // 🧹 Render danh sách sale
  dropdown.innerHTML = sales
    .map(
      (s) => `
      <li class="${s === defaultSale ? "active" : ""}">
        <span class="radio_box ${s === defaultSale ? "active" : ""}"></span>
        <span>${s}</span>
      </li>
    `
    )
    .join("");

  // ✅ Hiển thị mặc định
  selected.textContent = defaultSale;
  renderLeadTagChartBySale(grouped, defaultSale);

  // 🟡 Toggle dropdown
  const toggle = selectWrap.querySelector(".flex");
  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dom_select_show.active").forEach((u) => {
        if (u !== dropdown) u.classList.remove("active");
      });
      dropdown.classList.toggle("active");
    });
  }

  // ✅ Dùng event delegation (1 listener duy nhất)
  if (!dropdown.dataset.bound) {
    dropdown.dataset.bound = "1";
    dropdown.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (!li) return;

      // Bỏ active cũ
      dropdown
        .querySelectorAll("li")
        .forEach((el) => el.classList.remove("active"));
      dropdown
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));

      // Active mới
      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      const saleName = li.querySelector("span:nth-child(2)").textContent.trim();
      selected.textContent = saleName;

      // Cập nhật biểu đồ + bảng
      renderLeadTagChartBySale(grouped, saleName);

      if (searchInput) searchInput.value = saleName;
      const filtered = RAW_DATA.filter((lead) => {
        const owner = lead.OwnerIDText?.toLowerCase() || "";
        return owner.includes(saleName.toLowerCase());
      });
      renderLeadTable(filtered);

      dropdown.classList.remove("active");
    });
  }

  // 🔹 Click ngoài để đóng (gán 1 lần duy nhất)
  if (!document._saleTagOutside) {
    document.addEventListener("click", (e) => {
      if (!selectWrap.contains(e.target)) dropdown.classList.remove("active");
    });
    document._saleTagOutside = true;
  }
}

function renderLeadTagChartBySale(grouped, saleName) {
  const ctx = document.getElementById("leadTagChartbySale");
  if (!ctx) return;

  // 🔍 Tìm sale tương ứng nhanh hơn (dùng cache tên đã cắt)
  const matchedKey = Object.keys(grouped.byOwner).find(
    (k) => k.replace(/\s*\(NV.*?\)/gi, "").trim() === saleName
  );
  const ownerData = grouped.byOwner[matchedKey];
  if (!ownerData) return;

  // 🧭 Thứ tự cố định
  const tagOrder = [
    "Considering",
    "Needed",
    "Bad timing",
    "Unqualified",
    "Junk",
    "New",
    "Untag",
  ];

  // 🧮 Chuẩn bị dữ liệu gọn, không map/filter lồng nhau
  const labels = [];
  const values = [];
  for (let i = 0; i < tagOrder.length; i++) {
    const tag = tagOrder[i];
    const count = ownerData.tags?.[tag]?.count || 0;
    if (count > 0) {
      labels.push(tag);
      values.push(count);
    }
  }

  const maxValue = Math.max(...values);
  const barColors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // 🔧 Nếu chart đã có → chỉ update khi data khác
  if (window.leadTagChartBySaleInstance) {
    const chart = window.leadTagChartBySaleInstance;
    const ds = chart.data.datasets[0];

    // So sánh nhanh → nếu không đổi thì khỏi update
    if (
      arraysEqual(chart.data.labels, labels) &&
      arraysEqual(ds.data, values)
    ) {
      return;
    }

    chart.data.labels = labels;
    ds.data = values;
    ds.backgroundColor = barColors;
    ds.borderColor = barColors;
    ds.label = `Leads by Tag (${saleName})`;
    chart.update("active"); // ⚡ update không animation
    return;
  }

  // 🚀 Tạo chart lần đầu (animation cực nhẹ)
  window.leadTagChartBySaleInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `Leads by Tag (${saleName})`,
          data: values,
          backgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 1,
          categoryPercentage: 0.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300, easing: "easeOutQuad" }, // ⚙️ mượt nhẹ mà vẫn nhanh
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          color: "#333",
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: "rgb(240, 240, 240)",
            drawTicks: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "rgb(85, 85, 85)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "rgb(102, 102, 102)",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
          grid: { color: "rgb(240, 240, 240)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });

  // ⚙️ So sánh mảng nhanh
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

function filterLeadsBySelection(data) {
  return data.filter((lead) => {
    const campaign = lead.CustomField13Text || "Campaign";
    const source = lead.CustomField14Text || "Source";
    const medium = lead.CustomField15Text || "Medium";

    if (currentFilter.campaign && currentFilter.campaign !== campaign)
      return false;
    if (currentFilter.source && currentFilter.source !== source) return false;
    if (currentFilter.medium && currentFilter.medium !== medium) return false;

    return true;
  });
}
function updateLeadCounters(grouped, tagFilter = currentTagFilter) {
  if (!grouped || !grouped.byTag) return;

  const totalLeads = Object.values(grouped.byDate).reduce(
    (sum, d) => sum + (d.total || 0),
    0
  );

  // Tổng số lead thuộc tag đang xem
  const tagLeads = grouped.byTag[tagFilter]
    ? grouped.byTag[tagFilter].length
    : 0;

  const percent =
    totalLeads > 0 ? ((tagLeads / totalLeads) * 100).toFixed(1) : 0;

  // 🧮 Render ra UI
  const countLead = document.getElementById("count_lead");
  const countNeeded = document.getElementById("count_needed");

  if (countLead)
    countLead.querySelector(
      "span"
    ).textContent = `${totalLeads.toLocaleString()}`;

  if (countNeeded)
    countNeeded.querySelector(
      "span"
    ).textContent = `${tagLeads.toLocaleString()} (${percent}%) ${tagFilter}`;
}

// ============================
// CLEAR FILTER
// ============================
function setupClearFilter() {
  const clearBtn = document.querySelector(".clear_filter");
  if (!clearBtn) return;

  clearBtn.onclick = () => {
    // 🔄 Reset biến filter
    currentFilter.campaign = null;
    currentFilter.source = null;
    currentFilter.medium = null;

    // 🧹 Chỉ reset các dropdown trong .dom_filter (campaign/source/medium)
    const filterArea = document.querySelector(".dom_filter");
    if (filterArea) {
      ["campaign", "source", "medium"].forEach((cls) => {
        const select = filterArea.querySelector(`.dom_select.${cls}`);
        if (!select) return;

        const selected = select.querySelector(".dom_selected");
        if (selected) {
          if (cls === "campaign") selected.textContent = "All campaign";
          if (cls === "source") selected.textContent = "All Source";
          if (cls === "medium") selected.textContent = "All Medium";
        }

        // Gỡ class active
        select
          .querySelectorAll("li.active")
          .forEach((li) => li.classList.remove("active"));
        select
          .querySelectorAll(".radio_box.active")
          .forEach((r) => r.classList.remove("active"));
      });
    }

    // ✅ Giữ nguyên account hiện tại
    const currentAccount =
      localStorage.getItem("selectedAccount") || "Total Data";
    let filteredData = RAW_DATA;

    if (currentAccount === "VTCI") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() == "VTCI"
      );
    } else if (currentAccount === "IDEAS") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() == "IDEAS"
      );
    }

    // ✅ Process lại
    setActiveAccountUI(currentAccount);
    processAndRenderAll(filteredData);

    // ✅ Re-render toàn bộ dashboard (theo account hiện tại)
    // renderFilterOptions();
    // renderLeadTrendChart(GROUPED, currentTagFilter);
    // updateLeadCounters(GROUPED, currentTagFilter);
    // renderToplist(GROUPED);
    // renderCampaignPieChart(GROUPED);
    // renderTagFrequency(GROUPED);
    // renderLeadQualityMeter(GROUPED);
    // renderLeadTable(filteredData);
    // renderSaleFilter(GROUPED);
  };
}

// ============================
// DROPDOWN OPEN/CLOSE
// ============================
function formatDisplayDate(from, to) {
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
  return `${fmt(f)} - ${fmt(t)}`;
}

function getDateRange(option) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  let from, to;

  switch (option) {
    case "this_week":
      from = new Date(mondayThisWeek);
      to = new Date(mondayThisWeek);
      to.setDate(from.getDate() + 6);
      break;

    case "last_week":
      from = new Date(mondayThisWeek);
      from.setDate(from.getDate() - 7);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
      break;

    case "this_month":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;

    // ✅ Last 7 days (không tính hôm nay)
    case "last_7days":
      to = new Date(today);
      to.setDate(today.getDate() - 1); // hôm qua
      from = new Date(to);
      from.setDate(to.getDate() - 6); // tổng cộng 7 ngày
      break;

    // ✅ Previous 7 days — 7 ngày liền kề trước last_7days
    case "previous_7days":
      to = new Date(today);
      to.setDate(today.getDate() - 8); // kết thúc trước "last_7days"
      from = new Date(to);
      from.setDate(to.getDate() - 6);
      break;

    case "yesterday":
      from = new Date(today);
      from.setDate(today.getDate() - 1);
      to = new Date(from);
      break;

    case "today":
      from = new Date(today);
      to = new Date(today);
      break;

    default:
      from = new Date(today);
      to = new Date(today);
  }

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}

// Hàm cập nhật UI account khi reset về Total Data
function setActiveAccountUI(accountName) {
  const activeBlock = document.querySelector(
    ".dom_account_view_block .account_item"
  );
  if (!activeBlock) return;

  const accountMap = {
    VTCI: {
      img: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    },
    IDEAS: {
      img: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    },
    "Total Data": {
      img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRlIpztniIEN5ZYvLlwwqBvhzdodvu2NfPSbg&s",
    },
  };

  const acc = accountMap[accountName] || accountMap["Total Data"];
  const avatar = activeBlock.querySelector(".account_item_avatar");
  const name = activeBlock.querySelector(".account_item_name");

  avatar.src = acc.img;
  name.textContent = accountName;

  // Ẩn account đang chọn khỏi danh sách
  document.querySelectorAll(".dom_account_view ul li").forEach((li) => {
    const liName = li.querySelector("p span:first-child")?.textContent.trim();
    if (liName === accountName) {
      li.style.display = "none";
    } else {
      li.style.display = "";
    }
  });
}

function clearAllDropdownFilters() {
  console.log("🧹 Reset filter dropdown (campaign/source/medium)");

  currentFilter.campaign = null;
  currentFilter.source = null;
  currentFilter.medium = null;

  const filterArea = document.querySelector(".dom_filter");
  if (!filterArea) return;

  ["campaign", "source", "medium"].forEach((cls) => {
    const select = filterArea.querySelector(`.dom_select.${cls}`);
    if (!select) return;

    const selected = select.querySelector(".dom_selected");
    if (selected) {
      if (cls === "campaign") selected.textContent = "All campaign";
      if (cls === "source") selected.textContent = "All Source";
      if (cls === "medium") selected.textContent = "All Medium";
    }

    select
      .querySelectorAll("li.active, .radio_box.active")
      .forEach((el) => el.classList.remove("active"));
  });
}

function setupAccountFilter() {
  const wrap = document.querySelector(".dom_account_view");
  if (!wrap) return;

  const activeBlock = wrap.querySelector(
    ".dom_account_view_block .account_item"
  );
  const list = wrap.querySelector("ul");
  const items = wrap.querySelectorAll("ul li");

  // 🟢 Mặc định Total Data mỗi lần load
  localStorage.setItem("selectedAccount", "Total Data");
  setActiveAccountUI("Total Data");

  // 🟡 Toggle dropdown
  activeBlock.onclick = (e) => {
    e.stopPropagation();
    list.classList.toggle("active");
  };

  // 🟢 Click chọn account
  items.forEach((li) => {
    li.onclick = async (e) => {
      e.stopPropagation();
      const account = li.querySelector("p span:first-child").textContent.trim();

      // Lọc dữ liệu theo account
      let filtered = RAW_DATA;
      if (account === "VTCI") {
        filtered = RAW_DATA.filter(
          (l) => l.CustomField16Text?.trim().toUpperCase() === "VTCI"
        );
      } else if (account === "IDEAS") {
        filtered = RAW_DATA.filter(
          (l) => l.CustomField16Text?.trim().toUpperCase() === "IDEAS"
        );
      }

      // ⚠️ Nếu không có dữ liệu → cảnh báo & giữ nguyên UI
      if (!filtered?.length) {
        alert(
          `⚠️ Không có dữ liệu cho account "${account}", vui lòng chọn khoảng thời gian khác!`
        );
        console.warn(
          `⚠️ Account ${account} không có dữ liệu, giữ nguyên dashboard.`
        );
        list.classList.remove("active");
        return; // ⛔ Không đổi UI, không render lại
      }

      // ✅ Có dữ liệu → cập nhật localStorage + UI
      localStorage.setItem("selectedAccount", account);
      list.classList.remove("active");

      // ✅ Clear toàn bộ campaign/source/medium filter
      clearAllDropdownFilters();

      console.log(`✅ ${filtered.length} leads thuộc account ${account}`);
      setActiveAccountUI(account);

      // 🔹 Process & render lại dashboard
      processAndRenderAll(filtered, true);
      resetToFirstMenu();
    };
  });

  // 🔹 Đóng dropdown khi click ngoài
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) list.classList.remove("active");
  });
}

function setupTimeDropdown() {
  const timeSelect = document.querySelector(".dom_select.time");
  if (!timeSelect) return;

  const toggle = timeSelect.querySelector(".flex");
  const list = timeSelect.querySelector(".dom_select_show");
  const selectedLabel = timeSelect.querySelector(".dom_selected");
  const dateText = document.querySelector(".dom_date");
  const applyBtn = timeSelect.querySelector(".apply_custom_date");
  const customBox = timeSelect.querySelector(".custom_date");
  const allItems = list.querySelectorAll("li");

  // 🟡 Toggle dropdown
  toggle.onclick = (e) => {
    e.stopPropagation();
    document
      .querySelectorAll(".dom_select_show")
      .forEach((ul) => ul !== list && ul.classList.remove("active"));
    list.classList.toggle("active");
  };

  // 🟢 Chọn preset thời gian
  allItems.forEach((li) => {
    li.onclick = async (e) => {
      e.stopPropagation();
      const type = li.dataset.date;

      if (type === "custom_range") {
        allItems.forEach((i) => i.classList.remove("active"));
        li.classList.add("active");
        customBox.classList.add("show");
        return;
      }

      // reset active
      allItems.forEach((i) => i.classList.remove("active"));
      li.classList.add("active");
      customBox.classList.remove("show");

      const label = li.querySelector("span:last-child").textContent.trim();
      selectedLabel.textContent = label;

      const range = getDateRange(type);
      dateText.textContent = formatDisplayDate(range.from, range.to);

      // ✅ Fetch lại theo ngày
      RAW_DATA = await fetchLeads(range.from, range.to);
      // ✅ Reset account về “Total Data”
      localStorage.setItem("selectedAccount", "Total Data");
      setActiveAccountUI("Total Data");
      processAndRenderAll(RAW_DATA, true);
      list.classList.remove("active");
    };
  });

  // 🟠 Custom date apply
  applyBtn.onclick = async (e) => {
    e.stopPropagation();
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;

    if (!start || !end)
      return alert("⚠️ Vui lòng chọn đủ ngày bắt đầu và kết thúc!");

    const startDate = new Date(start);
    const endDate = new Date(end);
    const minDate = new Date("2025-10-01");

    if (startDate < minDate)
      return alert("⚠️ Ngày bắt đầu không được trước 01/10/2025!");
    if (endDate <= startDate)
      return alert("⚠️ Ngày kết thúc phải sau ngày bắt đầu!");

    selectedLabel.textContent = "Custom Date";
    dateText.textContent = formatDisplayDate(start, end);

    // ✅ Fetch lại
    RAW_DATA = await fetchLeads(start, end);
    processAndRenderAll(RAW_DATA, true);
    // ✅ Reset account về “Total Data”
    localStorage.setItem("selectedAccount", "Total Data");
    setActiveAccountUI("Total Data");
    list.classList.remove("active");
    customBox.classList.remove("show");
  };

  // 🔹 Đóng khi click ra ngoài
  document.addEventListener("click", (e) => {
    if (!timeSelect.contains(e.target)) list.classList.remove("active");
  });
}
function setupDropdowns() {
  // ✅ các selector tái sử dụng
  const showSelectors =
    ".dom_select.saleperson_detail .dom_select_show, .dom_select.campaign .dom_select_show, .dom_select.source .dom_select_show, .dom_select.medium .dom_select_show";
  const containerSelectors =
    ".dom_select.saleperson_detail, .dom_select.campaign, .dom_select.source, .dom_select.medium";
  const activeGroupSelectors =
    ".dom_select.saleperson_detail .dom_select_show.active, .dom_select.campaign .dom_select_show.active, .dom_select.source .dom_select_show.active, .dom_select.medium .dom_select_show.active";
  const itemSelectors =
    ".dom_select.saleperson_detail .dom_select_show li, .dom_select.campaign .dom_select_show li, .dom_select.source .dom_select_show li, .dom_select.medium .dom_select_show li";

  // 🔹 Đóng tất cả dropdown show trong nhóm
  document
    .querySelectorAll(showSelectors)
    .forEach((u) => u.classList.remove("active"));

  // 🔹 Chỉ chọn đúng các dropdown container cần setup
  const selects = document.querySelectorAll(containerSelectors);

  // flag tạm khi vừa chọn item
  let justSelected = false;

  selects.forEach((sel) => {
    const toggle = sel.querySelector(".flex");
    const list = sel.querySelector(".dom_select_show");
    if (!toggle || !list) return;

    // ⛔ Chặn gán trùng listener trên toggle
    if (toggle.dataset.dropdownBound) return;
    toggle.dataset.dropdownBound = "1";

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();

      // Nếu vừa chọn item thì bỏ qua (tránh bật lại)
      if (justSelected) return;

      // 🔹 Đóng dropdown khác trong nhóm
      document.querySelectorAll(activeGroupSelectors).forEach((u) => {
        if (u !== list) u.classList.remove("active");
      });

      // 🔹 Mở/tắt dropdown hiện tại
      list.classList.toggle("active");
    });
  });

  // 🔹 Global click (chỉ bind 1 lần)
  if (!window.__dropdownGlobalBound) {
    window.__dropdownGlobalBound = true;

    document.addEventListener("click", (e) => {
      // Nếu vừa chọn item thì bỏ qua (tránh bật lại)
      if (justSelected) return;

      const clickedItem = e.target.closest(itemSelectors);

      if (clickedItem) {
        // Mark và reset sau 200ms để tránh race với toggle
        justSelected = true;
        setTimeout(() => (justSelected = false), 200);

        // Đóng tất cả dropdown active trong nhóm
        document
          .querySelectorAll(activeGroupSelectors)
          .forEach((u) => u.classList.remove("active"));
        return;
      }

      // Nếu click ngoài nhóm dropdown -> đóng hết trong nhóm
      if (!e.target.closest(containerSelectors)) {
        document
          .querySelectorAll(activeGroupSelectors)
          .forEach((u) => u.classList.remove("active"));
      }
    });
  }
}

function renderLeadTagChart(grouped) {
  const ctx = document.getElementById("leadTagChart");
  const top_tag = document.getElementById("top_tag");
  if (!ctx || !grouped?.byTag) return;

  // ⚙️ Gom dữ liệu siêu nhanh (cache & tránh tính thừa)
  const entries = Object.entries(grouped.byTag);
  if (!entries.length) return;

  const labels = [];
  const values = [];
  let maxIndex = 0;
  let maxValue = 0;

  for (let i = 0; i < entries.length; i++) {
    const [tag, arr] = entries[i];
    const count = arr.length;
    labels.push(tag);
    values.push(count);
    if (count > maxValue) {
      maxValue = count;
      maxIndex = i;
    }
  }

  // 🎨 Tô màu: cột lớn nhất vàng
  const barColors = new Array(values.length).fill("#d9d9d9");
  barColors[maxIndex] = "#ffa900";

  // 🏷️ Gán top tag nhanh
  if (top_tag) top_tag.textContent = labels[maxIndex] || "";

  // ⚡ Nếu chart đã tồn tại → chỉ update khi data khác
  const chart = window.leadTagChartInstance;
  if (chart) {
    const oldData = chart.data.datasets[0].data;
    // tránh re-render vô ích
    if (
      oldData.length === values.length &&
      oldData.every((v, i) => v === values[i])
    )
      return;

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = barColors;
    chart.data.datasets[0].borderColor = barColors;
    chart.update();
    return;
  }

  // 🚀 Tạo chart mới
  window.leadTagChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Leads by Tag",
          data: values,
          backgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      // ⚡ Animation cực nhanh
      animation: {
        duration: 400,
        easing: "easeOutCubic",
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "#555" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.05),
          grid: { color: "rgba(0,0,0,0.04)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

// ======================
// 🧩 Render Toplist
// ======================
let ORIGINAL_DATA = null;
function mergeAllArrays(obj) {
  const result = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object") {
      for (const arr of Object.values(value)) {
        if (Array.isArray(arr)) {
          result.push(...arr);
        }
      }
    }
  }

  return result;
}
function setSourceActive() {
  const btnSource = document.querySelector(".btn-source");
  const btnCampaign = document.querySelector(".btn-campaign");

  if (btnSource && btnCampaign) {
    btnCampaign.classList.remove("active");
    btnSource.classList.add("active");
  }
}

function renderToplist(grouped, mode = "default") {
  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist");
  const dashboard = document.querySelector(".dom_dashboard");
  const saleDetailUI = document.querySelector(".sale_report");
  const dateUI = document.querySelector(".dom_date");
  if (!wrap || !grouped?.byCampaign) return;
  if (!ORIGINAL_DATA) ORIGINAL_DATA = RAW_DATA;

  const list = [];

  // 🧮 Duyệt dữ liệu
  for (const [campaign, sources] of Object.entries(grouped.byCampaign)) {
    let totalCampaign = 0;
    let qualityCampaign = 0;

    for (const [source, mediums] of Object.entries(sources)) {
      for (const [medium, leads] of Object.entries(mediums)) {
        const total = leads.length;
        const needed = leads.filter((l) => l.TagMain === "Needed").length;
        const considering = leads.filter(
          (l) => l.TagMain === "Considering"
        ).length;
        const quality = needed + considering;
        const ratio = total > 0 ? (quality / total) * 100 : 0;

        totalCampaign += total;
        qualityCampaign += quality;

        if (mode === "default") {
          list.push({
            key: `${campaign} - ${source} - ${medium}`,
            campaign,
            source,
            medium,
            total,
            quality,
            ratio: +ratio.toFixed(1),
          });
        }
      }
    }

    if (mode === "campaign") {
      const ratio =
        totalCampaign > 0 ? (qualityCampaign / totalCampaign) * 100 : 0;
      list.push({
        key: `${campaign}`,
        campaign,
        total: totalCampaign,
        quality: qualityCampaign,
        ratio: +ratio.toFixed(1),
      });
    }
  }

  // 🔽 Sắp xếp theo tổng lead giảm dần
  list.sort((a, b) => b.total - a.total);

  // 🧹 Xóa nội dung cũ
  wrap.innerHTML = "";

  // 🎨 Logo map
  const logos = [
    {
      match: /facebook|fb/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Logo_de_Facebook.png/1200px-Logo_de_Facebook.png",
    },
    {
      match: /google/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png",
    },
    {
      match: /tiktok/i,
      url: "https://www.logo.wine/a/logo/TikTok/TikTok-Icon-White-Dark-Background-Logo.wine.svg",
    },
    {
      match: /linkedin/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/1024px-LinkedIn_icon.svg.png",
    },
    {
      match: /zalo/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Zalo_logo_2021.svg/512px-Zalo_logo_2021.svg.png",
    },
    {
      match: /Other - Web VTCI/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    },
    {
      match: /Other - Web IDEAS/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    },
  ];

  const defaultLogo =
    "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp";

  // 🚀 Render danh sách
  list.forEach((item) => {
    let barColor = "rgb(0, 177, 72)";
    if (item.ratio < 20) barColor = "rgb(225, 112, 85)";
    else if (item.ratio < 40) barColor = "rgb(255, 169, 0)";

    let logo = defaultLogo;
    for (const entry of logos) {
      if (entry.match.test(item.key)) {
        logo = entry.url;
        break;
      }
    }

    const html = `
      <li data-campaign="${item.campaign}" data-source="${
      item.source || ""
    }" data-medium="${item.medium || ""}">
        <p><img src="${logo}" /><span>${item.key}</span></p>
        <p><i class="fa-solid fa-user"></i><span class="total_lead">${
          item.total
        }</span></p>
        <p><i class="fa-solid fa-user-graduate"></i><span class="quality_lead">${
          item.quality
        }</span></p>
        <p class="toplist_percent" style="color:${barColor}; background:rgba(${barColor
      .replace("rgb(", "")
      .replace(")", "")},0.1)">${item.ratio}%</p>
        <p class="toplist_more_ads" title="Xem chi tiết ${
          item.key
        }"><i class="fa-solid fa-magnifying-glass-chart main_clr"></i></p>
      </li>
    `;
    wrap.insertAdjacentHTML("beforeend", html);
  });

  // 🔹 Click lọc theo campaign/source/medium
  wrap.querySelectorAll(".toplist_more_ads").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      setSourceActive();
      const li = e.currentTarget.closest("li");
      const campaign = li.dataset.campaign;
      const source = li.dataset.source;
      const medium = li.dataset.medium;
      if (campaign && source && medium) {
        const leads = GROUPED.byCampaign[campaign][source][medium];
        processAndRenderAll(leads);
      } else if (campaign) {
        const leads = GROUPED.byCampaign[campaign];
        const dataMerged = mergeAllArrays(leads);
        processAndRenderAll(dataMerged);
      }

      // const leads = GROUPED[][][]
      // .filter((l) => {
      //   const lCampaign = l.CustomField13Text || "Campaign";
      //   const lSource = l.CustomField14Text || "Source";
      //   const lMedium = l.CustomField15Text || "Medium";

      //   if (mode === "campaign") return lCampaign === campaign;
      //   return (
      //     lCampaign === campaign && lSource === source && lMedium === medium
      //   );
      // });

      dashboard.classList.add("sale_detail_ads");

      const img = saleDetailUI.querySelector("img");
      const pName = saleDetailUI.querySelector(".dom_selected");
      const calender = saleDetailUI.querySelector(".sale_report_calender");
      if (img) img.src = li.querySelector("img").src;
      if (pName) pName.innerText = li.querySelector("span").innerText;
      if (calender) calender.innerText = dateUI?.innerText || "";

      wrap.querySelectorAll("li").forEach((l) => l.classList.remove("active"));
      li.classList.add("active");
    });
  });

  // 🔹 Nút quay lại (back)
}

// ======================
// ⚙️ Nút toggle chế độ lọc
// ======================
document.addEventListener("click", (e) => {
  // --- 1️⃣ Đóng sale detail ---
  const backBtn =
    e.target.closest(".sale_report .sale_report_close") ||
    e.target.closest(".dom_overlay");
  if (backBtn) {
    const dashboard = document.querySelector(".dom_dashboard");
    if (dashboard) {
      console.log("remove");
      dashboard.classList.remove("sale_detail_ads", "sale_detail");
      if (ORIGINAL_DATA) processAndRenderAll(ORIGINAL_DATA);
    }
    setSourceActive();
    return; // ngăn xử lý tiếp
  }

  // --- 2️⃣ Mở AI Report ---
  const aiBtn = e.target.closest(".ai_report");
  if (aiBtn) {
    const panel = document.querySelector(".dom_ai_report");
    if (!panel) return;
    
    // Gọi báo cáo
    generateAdvancedReport(CRM_DATA);
    
    // Kích hoạt panel
    panel.classList.add("active");
    
    // Scroll panel lên đầu
    const dom_ai_report_content = document.querySelector(".dom_ai_report_content");
    dom_ai_report_content.scrollTop = 0;
    // Hoặc nếu muốn cuộn cả body theo panel: panel.scrollIntoView({ behavior: "smooth" });

    // Sau 3s (giả lập load + chờ), cho từng item fade-in
    setTimeout(() => {
      const items = panel.querySelectorAll(".fade_in_item");
      items.forEach((el, i) => {
        setTimeout(() => el.classList.add("show"), i * 300); // 0.3s mỗi item
      });
    }, 3000);

    return; // chặn event tiếp
  }
  const aiBtnS = e.target.closest(".ai_report_sale");
  const aiCompareBtn = e.target.closest(".ai_report_compare");
  if (aiCompareBtn) {
    const panel = document.querySelector(".dom_ai_report");
    if (!panel) return;
    generateAdvancedCompareReport();
    // Kích hoạt panel
    panel.classList.add("active");
    const dom_ai_report_content = document.querySelector(".dom_ai_report_content");
    dom_ai_report_content.scrollTop = 0;
    return; // chặn event tiếp
  }
  if (aiBtnS) {
    const panel = document.querySelector(".dom_ai_report");
    if (!panel) return;
    const activeSaleEl = document.querySelector(
      ".saleperson_detail .dom_selected"
    );
    const saleName =
      activeSaleEl?.textContent?.trim() || VIEW_DATA[0]?.OwnerIDText || "Sale";
    generateSaleReportAI(VIEW_DATA, saleName);
    // Kích hoạt panel
    panel.classList.add("active");

    const dom_ai_report_content = document.querySelector(".dom_ai_report_content");
    dom_ai_report_content.scrollTop = 0;

    return; // chặn event tiếp
  }

  // --- 3️⃣ Đóng AI Report ---
  const closeBtn = e.target.closest(".dom_ai_report_close");
  if (closeBtn) {
    const reportPanel = document.querySelector(".dom_ai_report");
    if (reportPanel) {
      reportPanel.classList.add("closing");

      // ⏳ Đợi animation xong rồi xóa class
      reportPanel.addEventListener(
        "animationend",
        () => {
          reportPanel.classList.remove("active", "closing");
        },
        { once: true }
      );
    }
  }
});
document.addEventListener("click", async (e) => {});

document.addEventListener("DOMContentLoaded", () => {
  const btnSource = document.querySelector(".button_group .btn-source");
  const btnCampaign = document.querySelector(".button_group .btn-campaign");

  if (!btnSource || !btnCampaign) return;

  btnSource.addEventListener("click", () => {
    btnSource.classList.add("active");
    btnCampaign.classList.remove("active");
    renderToplist(GROUPED, "default");
  });

  btnCampaign.addEventListener("click", () => {
    btnCampaign.classList.add("active");
    btnSource.classList.remove("active");
    renderToplist(GROUPED, "campaign");
  });
});

function setupSaleQualityDropdown(grouped) {
  const select = document.querySelector(".dom_select.sale_quality");
  if (!select) return;

  const selectedLabel = select.querySelector(".dom_selected");
  const list = select.querySelector(".dom_select_show");
  const toggle = select.querySelector(".flex");

  // ⚙️ Gán toggle 1 lần duy nhất
  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dom_select_show.active").forEach((u) => {
        if (u !== list) u.classList.remove("active");
      });
      list.classList.toggle("active");
    });
  }

  // 🧹 Clear listener cũ
  list.querySelectorAll("li").forEach((li) => {
    const newLi = li.cloneNode(true);
    li.parentNode.replaceChild(newLi, li);
  });

  // 🟢 Gán click chọn
  list.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      const tag = li.querySelector("span:nth-child(2)").textContent.trim();

      // Active UI
      list.querySelectorAll("li").forEach((i) => i.classList.remove("active"));
      li.classList.add("active");

      list
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));
      li.querySelector(".radio_box").classList.add("active");

      // Cập nhật label
      selectedLabel.textContent = tag;

      // Cập nhật chart
      renderLeadSaleChart(grouped, tag);

      // Đóng dropdown
      list.classList.remove("active");
    });
  });

  // 🔹 Đóng khi click ngoài (gán 1 lần duy nhất)
  if (!document._saleQualityOutside) {
    document.addEventListener("click", (e) => {
      if (!select.contains(e.target)) list.classList.remove("active");
    });
    document._saleQualityOutside = true;
  }
}

function renderCampaignPieChart(grouped) {
  const ctx = document.getElementById("pieCampaign");
  if (!ctx) return;

  const labels = [];
  const values = [];

  // 🧮 Tính tổng lead của từng campaign
  for (const [campaign, sources] of Object.entries(grouped.byCampaign)) {
    let count = 0;
    for (const src of Object.values(sources)) {
      for (const leads of Object.values(src)) {
        count += leads.length;
      }
    }
    labels.push(campaign);
    values.push(count);
  }

  // 🎨 Bảng màu chính + phụ
  const mainPalette = [
    "#ffa900", // vàng
    "#262a53", // xanh than
    "#cccccc", // xám
    "#e17055", // cam
  ];

  const extraPalette = [
    "#74b9ff",
    "#a29bfe",
    "#55efc4",
    "#fab1a0",
    "#fdcb6e",
    "#81ecec",
    "#b2bec3",
  ];

  // ✅ Tạo bảng màu theo số lượng campaign
  const colors = [...mainPalette, ...extraPalette];
  const bgColors = labels.map((_, i) => colors[i % colors.length] + "cc"); // 80% opacity
  const borderColors = labels.map((_, i) => colors[i % colors.length]);
  const total = values.reduce((a, b) => a + b, 0);

  // 🔄 Update nếu chart đã tồn tại
  if (window.campaignPieInstance) {
    const chart = window.campaignPieInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = bgColors;
    chart.data.datasets[0].borderColor = borderColors;
    chart.update("active");
    return;
  }

  // 🚀 Vẽ Pie Chart
  window.campaignPieInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          label: "Campaign Share",
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 10 },
      animation: {
        duration: 900,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          position: "bottom", // ✅ canh bên phải
          align: "center",
          labels: {
            boxWidth: 8,
            padding: 10,
            color: "#333",
            font: { size: 11, weight: "500" },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed;
              const percent =
                total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${value} (${percent}%)`;
            },
          },
        },
        datalabels: {
          color: "#fff",
          font: { size: 10, weight: "600" },
          formatter: (value) => {
            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return percent > 3 ? `${percent}%` : "";
          },
          anchor: "end",
          align: "end",
          offset: 4,
          clip: false,
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}
function renderLeadSaleChart(grouped, tagFilter = "Needed") {
  if (!grouped?.byOwner) return;

  const ctx = document.getElementById("leadSale");
  if (!ctx) return;

  // 🧮 Chuẩn bị dữ liệu (dùng mảng tĩnh, tránh push nhiều lần)
  const entries = Object.entries(grouped.byOwner);
  const labels = new Array(entries.length);
  const totalCounts = new Array(entries.length);
  const tagCounts = new Array(entries.length);

  for (let i = 0; i < entries.length; i++) {
    const [owner, ownerData] = entries[i];
    labels[i] = owner.replace(/\s*\(NV.*?\)/gi, "").trim();
    totalCounts[i] = ownerData.total || 0;
    tagCounts[i] = ownerData.tags?.[tagFilter]?.count || 0;
  }

  const maxValue = Math.max(...totalCounts, ...tagCounts);
  const ctx2d = ctx.getContext("2d");

  const tagColor = "rgba(38, 42, 83, 0.8)";
  const totalColor = "rgba(255, 171, 0, 0.8)";

  // 🔁 Nếu chart đã có → update nhanh, không re-render toàn bộ
  if (window.leadSaleChartInstance) {
    const chart = window.leadSaleChartInstance;
    const ds0 = chart.data.datasets[0];
    const ds1 = chart.data.datasets[1];

    // ✅ Chỉ cập nhật nếu dữ liệu thay đổi (tránh trigger animation vô ích)
    let changed = false;
    if (
      chart.data.labels.length !== labels.length ||
      chart.data.labels.some((l, i) => l !== labels[i])
    ) {
      chart.data.labels = labels;
      changed = true;
    }
    if (!arraysEqual(ds0.data, totalCounts)) {
      ds0.data = totalCounts;
      changed = true;
    }
    if (!arraysEqual(ds1.data, tagCounts)) {
      ds1.data = tagCounts;
      ds1.label = `${tagFilter} Leads`;
      changed = true;
    }

    if (changed) {
      // 🚀 Tắt animation khi update để tăng tốc
      chart.update("active");
    }
    return;
  }

  // 🚀 Tạo chart lần đầu
  window.leadSaleChartInstance = new Chart(ctx2d, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Total Leads",
          data: totalCounts,
          backgroundColor: totalColor,
          borderColor: totalColor.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: 5,
        },
        {
          label: `${tagFilter} Leads`,
          data: tagCounts,
          backgroundColor: tagColor,
          borderColor: tagColor.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // ⚙️ tắt animation khởi tạo → load cực nhanh
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = totalCounts[ctx.dataIndex] || 0;
              const count = ctx.parsed.y || 0;
              const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
              return `${
                ctx.dataset.label
              }: ${count.toLocaleString()} leads (${pct}%)`;
            },
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#444",
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
        },
      },
    },
    plugins: [ChartDataLabels],
  });

  // 🔧 Hàm so sánh mảng nhanh
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

function maskEmail(email) {
  if (!email) return "-";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 3);
  return `${visible}......@${domain}`;
}

function maskMobile(mobile) {
  if (!mobile) return "-";
  const last4 = mobile.slice(-4);
  return "*".repeat(Math.max(0, mobile.length - 4)) + last4;
}

function renderLeadTable(leads) {
  const container = document.querySelector(".dom_table_box");
  if (!container) return;

  if (!Array.isArray(leads) || leads.length === 0) {
    container.innerHTML = `
      <div class="dom_table_container empty">
        <p>No data</p>
      </div>`;
    return;
  }

  const headers = [
    "Created Date",
    "Lead Name",
    "Mobile",
    "Owner",
    "Tags",
    "Campaign",
    "Source",
    "Medium",
    "Organization",
    "Description",
  ];

  // 🧱 Khởi tạo bảng
  container.innerHTML = `
    <div class="dom_table_container scrollable">
      <table id="main_table">
        <thead>
          <tr>${headers
            .map((h) => `<th class="sortable">${h}</th>`)
            .join("")}</tr>
        </thead>
        <tbody></tbody>
        <tfoot>
          <tr>
            <td colspan="3">
              View <span class="loaded_count">0</span> / ${leads.length.toLocaleString()} leads
            </td>
            <td colspan="${headers.length - 3}"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  const tbody = container.querySelector("tbody");
  const loadedCountEl = container.querySelector(".loaded_count");
  const wrapper = container.querySelector(".dom_table_container");
  const thList = container.querySelectorAll("thead th");

  // ⚙️ Biến trạng thái
  let index = 0;
  const INITIAL_CHUNK = 20;
  const SCROLL_CHUNK = 20;
  let isLoading = false;
  let sortAsc = false; // 🟡 Mặc định: mới nhất ở trên (↓)

  // 🔹 Sắp xếp ngay từ đầu
  leads.sort((a, b) => {
    const da = new Date(a.CreatedDate || 0).getTime();
    const db = new Date(b.CreatedDate || 0).getTime();
    return sortAsc ? da - db : db - da;
  });

  // 🧩 Hàm render batch
  function renderChunk(count) {
    const end = Math.min(index + count, leads.length);
    let html = "";

    for (let i = index; i < end; i++) {
      const l = leads[i];
      const {
        CreatedDate,
        LeadName,
        Mobile,
        OwnerIDText,
        TagIDText,
        CustomField13Text,
        CustomField14Text,
        CustomField15Text,
        CustomField16Text,
        Description,
      } = l;

      const date = CreatedDate
        ? new Date(CreatedDate).toLocaleDateString("vi-VN")
        : "-";

        let tagHtml = "-";
        if (TagIDText?.trim()) {
          tagHtml = TagIDText.split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((tag) => {
              const tagClass = /Needed/i.test(tag)
                ? "tag_needed"
                : /Considering/i.test(tag)
                ? "tag_considering"
                : /Bad timing/i.test(tag)
                ? "tag_bad"
                : /Unqualified/i.test(tag)
                ? "tag_unqualified"
                : /Junk/i.test(tag)
                ? "tag_junk"
                : "tag_other";
              return `<span class="tag_chip ${tagClass}">${tag}</span>`;
            })
            .join(" ");
        }
        

      html += `
        <tr data-id="${i}">
          <td>${date}</td>
          <td>${LeadName || "-"}</td>
          <td><i class="fa-solid fa-phone table_phone"></i> ${Mobile}</td>
          <td>${OwnerIDText?.replace(/\s*\(NV.*?\)/gi, "").trim() || "-"}</td>
          <td>${tagHtml}</td>
          <td>${CustomField13Text || "-"}</td>
          <td>${CustomField14Text || "-"}</td>
          <td>${CustomField15Text || "-"}</td>
          <td>${CustomField16Text || "-"}</td>
          <td>${Description || "-"}</td>
        </tr>`;
    }

    tbody.insertAdjacentHTML("beforeend", html);
    index = end;
    loadedCountEl.textContent = index.toLocaleString("en-US");
    isLoading = false;
  }

  // 🧹 Xóa và render lại toàn bộ
  function refreshTable() {
    tbody.innerHTML = "";
    index = 0;
    renderChunk(INITIAL_CHUNK);
    loadedCountEl.textContent = index.toLocaleString("en-US");
    wrapper.scrollTop = 0;
  }

  // 🔹 Render đợt đầu
  renderChunk(INITIAL_CHUNK);

  // 🔹 Scroll event: lazy load thêm
  wrapper.addEventListener("scroll", () => {
    if (isLoading) return;
    const { scrollTop, scrollHeight, clientHeight } = wrapper;
    if (scrollHeight - scrollTop - clientHeight < 200 && index < leads.length) {
      isLoading = true;
      requestAnimationFrame(() => renderChunk(SCROLL_CHUNK));
    }
  });

  // 🔸 Click sort theo "Created Date"
  thList.forEach((th) => {
    if (th.textContent === "Created Date") {
      th.classList.add("clickable");
      // 🔹 Hiện icon mặc định ↓ (mới nhất trên)
      th.innerHTML = 'Created Date <i class="fa-solid fa-sort"></i>';

      th.addEventListener("click", () => {
        sortAsc = !sortAsc;
        // Reset tất cả header khác
        thList.forEach((t) => (t.innerHTML = t.textContent));
        th.innerHTML =
          "Created Date " +
          (sortAsc
            ? '<i class="fa-solid fa-sort"></i>'
            : '<i class="fa-solid fa-sort"></i>');

        leads.sort((a, b) => {
          const da = new Date(a.CreatedDate || 0).getTime();
          const db = new Date(b.CreatedDate || 0).getTime();
          return sortAsc ? da - db : db - da;
        });

        refreshTable();
      });
    }
  });
}

function setupTagClick() {
  const wrap = document.querySelector(".frequency_tag");
  if (!wrap) return;

  // 🧠 Chỉ gắn 1 listener duy nhất
  wrap.addEventListener("click", (e) => {
    // 🔍 Tìm phần tử tag thật sự được click
    const tagEl = e.target.closest(".freq_tag_item");
    if (!tagEl || !wrap.contains(tagEl)) return;

    const tagName = tagEl.querySelector(".tag_name")?.innerText.trim();
    if (!tagName) return;

    // 🎨 Hiệu ứng active
    wrap
      .querySelectorAll(".freq_tag_item")
      .forEach((t) => t.classList.remove("active"));
    tagEl.classList.add("active");

    // 🔍 Lọc dữ liệu theo tag
    const leads = RAW_DATA.filter((lead) => {
      const tagText = lead.TagIDText || "";
      return tagText.includes(tagName);
    });

    if (leads.length) {
      processAndRenderAll(leads);
    } else {
      console.warn(`Không có lead nào thuộc tag "${tagName}"`);
    }

    // 🌈 Cập nhật dashboard
    const dashboard = document.querySelector(".dom_dashboard");
    const saleDetailUI = document.querySelector(".saleperson_detail");
    const saleDetailUIimg = document.querySelector(".saleperson_detail > img");
    dashboard?.classList.add("sale_detail_ads");
    saleDetailUI.querySelector(".dom_selected").innerText = tagName;
    saleDetailUIimg.src = "./tag.png";
  });
}

// ======================  CHART ======================

function renderTagFrequency(grouped) {
  const wrap = document.querySelector(".frequency_tag");
  if (!wrap || !grouped?.tagFrequency) return;

  const raw = grouped.tagFrequency;
  const exclude = new Set([
    "Needed",
    "Considering",
    "Bad timing",
    "Status - Bad timing",
    "Status - Junk",
    "Qualified",
    "Msc_AI UMEF",
    "MBA UMEF",
    "EMBA UMEF",
    "Unqualified",
    "Status - New",
    "Junk",
    "Untag",
    "BBA",
  ]);

  // ✅ Tạo list và sort nhanh (chỉ 1 lần)
  const list = Object.entries(raw)
    .filter(([tag]) => !exclude.has(tag))
    .sort((a, b) => b[1] - a[1]);

  // ✅ Clear nhanh gọn (tránh .innerHTML="" nhiều lần)
  wrap.textContent = "";

  // ⛔ Không có tag phụ
  if (!list.length) {
    wrap.innerHTML = `<p class="no_tag">Không có tag phụ nào</p>`;
    return;
  }

  // 🎨 Màu cố định, tái sử dụng, không re-alloc mỗi vòng
  const colors = [
    "#ffa900",
    "#262a53",
    "#cccccc",
    "#e17055",
    "#74b9ff",
    "#a29bfe",
    "#55efc4",
    "#fab1a0",
    "#fdcb6e",
  ];
  const colorCount = colors.length;

  // 🚀 Dựng HTML một lần → tránh append từng dòng gây reflow
  const html = list
    .map(
      ([tag, count], i) => `
        <p class="freq_tag_item" style="--tag-color:${colors[i % colorCount]}">
          <span class="tag_dot" style="background:${
            colors[i % colorCount]
          }"></span>
          <span class="tag_name">${tag}</span>
          <span class="tag_count">${count}</span>
        </p>`
    )
    .join("");

  // ✅ Cập nhật DOM 1 lần duy nhất
  wrap.insertAdjacentHTML("beforeend", html);
}

function renderDegreeChart(grouped) {
  console.log("renderDegreeChart grouped:", grouped);

  const ctx = document.getElementById("degreeChart");
  const top_edu = document.getElementById("top_edu");
  if (!ctx) return;

  // ⚙️ Nếu grouped không phải array (ví dụ GROUPED object) thì flatten
  const data = Array.isArray(grouped)
    ? grouped
    : Object.values(grouped.byOwner || {}).flatMap((o) => o.leads || []);
  if (!data.length) return;

  // 🧩 Regex pre-compile
// ⚡ Regex - KHÔNG có cờ /g
const regex = {
  duoiCD: /(dưới[\s_]*cao[\s_]*đẳng|duoi[\s_]*cao[\s_]*dang)/i,
  caoDang: /(cao[\s_]*đẳng|cao[\s_]*dang)/i,
  thpt: /thpt/i,
  sinhVien: /(sinh[\s_]*viên|sinh[\s_]*vien|sinhvien)/i,
  cuNhan: /(cử[\s_]*nhân|cu[\s_]*nhan)/i,
  thacSi: /(thạc[\s_]*sĩ|thac[\s_]*si)/i,
};

const degreeCounts = {
  "Cử nhân": 0,
  "Cao đẳng": 0,
  "Dưới cao đẳng": 0,
  THPT: 0,
  "Sinh viên": 0,
  "Thạc sĩ": 0,
  Khác: 0,
};

// ⚡ Preprocess mô tả một lần cho nhanh
const descs = data.map(d => (d.Description ? d.Description.toLowerCase() : ""));

for (const desc of descs) {
  if (!desc.trim()) continue;

  if (regex.duoiCD.test(desc)) degreeCounts["Dưới cao đẳng"]++;
  else if (regex.caoDang.test(desc)) degreeCounts["Cao đẳng"]++;
  else if (regex.thpt.test(desc)) degreeCounts["THPT"]++;
  else if (regex.cuNhan.test(desc)) degreeCounts["Cử nhân"]++;
  else if (regex.sinhVien.test(desc)) degreeCounts["Sinh viên"]++;
  else if (regex.thacSi.test(desc)) degreeCounts["Thạc sĩ"]++;
  else degreeCounts["Khác"]++;
}

VIEW_DEGREE = degreeCounts;
console.log("🎓 degreeCounts:", degreeCounts);

  VIEW_DEGREE = degreeCounts;
  console.log("🎓 degreeCounts:", degreeCounts);

  // ⚙️ Cập nhật chart
  const labels = Object.keys(degreeCounts);
  const values = Object.values(degreeCounts);
  const maxValue = Math.max(...values);
  const barColors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // 🏆 Gán top
  if (top_edu && maxValue > 0) {
    const maxIndex = values.indexOf(maxValue);
    top_edu.textContent = labels[maxIndex] || "";
  }

  // 🔄 Nếu chart đã có → update
  if (window.degreeChartInstance) {
    const chart = window.degreeChartInstance;
    if (
      JSON.stringify(chart.data.datasets[0].data) !== JSON.stringify(values)
    ) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.data.datasets[0].backgroundColor = barColors;
      chart.data.datasets[0].borderColor = barColors;
      chart.update();
    }
    return;
  }

  // 🚀 Tạo chart mới
  window.degreeChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Số lượng Leads theo trình độ học vấn",
          data: values,
          backgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutCubic" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} Leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: {
            color: "rgba(0,0,0,0.05)",
            drawTicks: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "#555" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
          grid: { color: "rgba(0,0,0,0.05)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

function renderProgramChart(grouped) {
  const ctx = document.getElementById("programChart");
  const top_program = document.getElementById("top_program");
  if (!ctx) return;

  // ✅ Dùng biến cục bộ, tránh đọc DOM nhiều lần
  const freq = grouped.tagFrequency || {};

  // ✅ Gom dữ liệu chương trình
  const programs = [
    ["MSc AI UMEF", freq["Msc_AI UMEF"] || 0],
    ["MBA UMEF", freq["MBA UMEF"] || 0],
    ["EMBA UMEF", freq["EMBA UMEF"] || 0],
    ["BBA", freq["BBA"] || 0],
    ["DBA", freq["DBA"] || 0],
  ].filter(([_, v]) => v > 0);

  if (!programs.length) {
    if (top_program) top_program.textContent = "-";
    if (window.programChartInstance) {
      window.programChartInstance.destroy();
      window.programChartInstance = null;
    }
    return;
  }

  // ✅ Chuẩn bị labels & values
  const labels = programs.map(([k]) => k);
  const values = programs.map(([_, v]) => v);
  const maxValue = Math.max(...values);
  const colors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // ✅ Cập nhật top label
  if (top_program) top_program.textContent = labels[values.indexOf(maxValue)];

  // ⚡ Nếu đã có chart → update cực nhanh, không re-render
  const existing = window.programChartInstance;
  if (existing) {
    const ds = existing.data.datasets[0];
    existing.data.labels = labels;
    ds.data = values;
    ds.backgroundColor = colors;
    ds.borderColor = colors;
    existing.options.animation.duration = 300; // nhanh hơn
    existing.update("none"); // không animation nặng
    return;
  }

  // 🚀 Tạo chart mới (chỉ chạy 1 lần)
  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // tắt hoàn toàn animation khi render lần đầu
      plugins: {
        legend: { display: false },
        tooltip: {
          intersect: false,
          animation: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          color: "#333",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#555", font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#666",
            font: { size: 11 },
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });

  window.programChartInstance = chart;
}

function renderLeadQualityMeter(grouped) {
  if (!grouped?.byTag) return;

  // 🔢 Tính toán tổng lead và từng nhóm
  const totalLeads = Object.values(grouped.byTag).flat().length;
  const neededCount = grouped.byTag["Needed"]?.length || 0;
  const consideringCount = grouped.byTag["Considering"]?.length || 0;
  const qualityCount = neededCount + consideringCount;

  // 📊 Tính % tổng
  const percent = totalLeads
    ? ((qualityCount / totalLeads) * 100).toFixed(2)
    : 0;
  const neededPercent = totalLeads
    ? ((neededCount / totalLeads) * 100).toFixed(1)
    : 0;
  const consideringPercent = totalLeads
    ? ((consideringCount / totalLeads) * 100).toFixed(1)
    : 0;

  // --- DOM elements ---
  const donut = document.querySelector(".semi-donut");
  const number = donut?.querySelector(".frequency_number");
  const labelNeeded = document.querySelector(".dom_frequency_label_impression");
  const labelConsidering = document.querySelector(".dom_frequency_label_reach");
  const rangeLabel = document.querySelector(".frequency_number_label");

  // --- Update donut (mức độ đầy và màu) ---
  if (donut) donut.style.setProperty("--percentage", percent);
  if (number)
    number.innerHTML = `<span>${percent}%</span><span>(${qualityCount})</span>`;

  // --- Update labels ---
  if (labelNeeded) labelNeeded.textContent = `${neededPercent}%`;
  if (labelConsidering) labelConsidering.textContent = `${consideringPercent}%`;

  // --- Update dòng tổng số ---
  if (rangeLabel) {
    const [left, right] = rangeLabel.querySelectorAll("p");
    if (left) left.textContent = `0`; // Needed + Considering
    if (right) right.textContent = `${totalLeads}`; // Total lead
  }

  // --- Màu vòng động theo chất lượng ---
  if (donut) {
    let fillColor = "#ffa900"; // mặc định vàng
    if (percent >= 40) fillColor = "#00b148"; // xanh lá khi tốt
    else if (percent <= 20) fillColor = "#e17055"; // đỏ nếu thấp
    donut.style.setProperty("--fill", fillColor);
  }
}

function renderLeadTrendChart(grouped, tagFilter = currentTagFilter) {
  currentTagFilter = tagFilter;
  const ctx = document.getElementById("leadTrendChart");
  if (!ctx) return;

  const byDate = grouped.byDate;
  const dates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
  if (!dates.length) return;

  // ✅ Chuẩn bị data cực nhanh (vòng for native)
  const totalCounts = new Array(dates.length);
  const tagCounts = new Array(dates.length);
  for (let i = 0; i < dates.length; i++) {
    const stat = byDate[dates[i]];
    totalCounts[i] = stat.total || 0;
    tagCounts[i] = stat[tagFilter] || 0;
  }

  // ✅ Gradient cache (tạo 1 lần duy nhất)
  let gradientTotal = window._gradTotal,
    gradientTag = window._gradTag;
  const ctx2d = ctx.getContext("2d");
  if (!gradientTotal || !gradientTag) {
    gradientTotal = ctx2d.createLinearGradient(0, 0, 0, 400);
    gradientTotal.addColorStop(0, "rgba(255, 171, 0, 0.8)");
    gradientTotal.addColorStop(1, "rgba(255, 171, 0, 0.1)");
    gradientTag = ctx2d.createLinearGradient(0, 0, 0, 400);
    gradientTag.addColorStop(0, "rgba(38,42,83, 0.8)");
    gradientTag.addColorStop(1, "rgba(38,42,83, 0.1)");
    window._gradTotal = gradientTotal;
    window._gradTag = gradientTag;
  }

  // 🧮 Update lead counter + tag chart (không block UI)
  requestIdleCallback(() => {
    updateLeadCounters(grouped, currentTagFilter);
    renderLeadTagChart(grouped);
  });

  // 🔄 Nếu chart đã có → update data cực nhanh
  const chart = window.leadChartInstance;
  if (chart) {
    chart.data.labels = dates;
    const [total, tag] = chart.data.datasets;
    total.data = totalCounts;
    tag.data = tagCounts;
    tag.label = `${tagFilter} Leads`;

    // 🧠 update nhẹ, bỏ animation cũ
    chart.options.animation.duration = 400;
    chart.update("active");
    return;
  }

  // 🚀 Tạo chart mới – config tối giản, full hiệu năng
  window.leadChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Total Leads",
          data: totalCounts,
          backgroundColor: gradientTotal,
          borderColor: "#ffab00",
          fill: true,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: `${tagFilter} Leads`,
          data: tagCounts,
          backgroundColor: gradientTag,
          borderColor: "#262a53",
          fill: true,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      elements: { line: { borderJoinStyle: "round" } },
      plugins: {
        legend: false,
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#555", maxTicksLimit: 10 },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#666",
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v),
          },
          grid: { color: "rgba(0,0,0,0.05)" },
          afterDataLimits: (scale) => (scale.max *= 1.05),
        },
      },
    },
  });
}

function getColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  const s = 65 + (hash % 10);
  const l = 55 + (hash % 10);
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ==================== Khởi tạo nút Close chỉ 1 lần ====================
function initSaleDetailClose() {
  const dashboard = document.querySelector(".dom_dashboard");
  const saleDetailUI = document.querySelector(".sale_report");
  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist.sale");
  if (!dashboard || !saleDetailUI || !wrap) return;

  const closeBtn = saleDetailUI.querySelector(".sale_report_close");
  if (!closeBtn) return;

  // 🧠 Nếu đã gắn event rồi thì thôi
  if (closeBtn.dataset.bound === "1") return;
  closeBtn.dataset.bound = "1";

  closeBtn.addEventListener("click", () => {
    dashboard.classList.remove("sale_detail");

    const currentAccount =
      localStorage.getItem("selectedAccount") || "Total Data";

    let filteredData = RAW_DATA;
    if (currentAccount === "VTCI") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() === "VTCI"
      );
    } else if (currentAccount === "IDEAS") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() === "IDEAS"
      );
    }

    processAndRenderAll(filteredData);

    wrap.querySelectorAll("li").forEach((l) => l.classList.remove("active"));
    console.log("🔄 Dashboard reset về trạng thái gốc");
  });
}

// gọi 1 lần khi load dashboard

function renderToplistBySale(grouped) {
  renderSaleDropdown();

  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist.sale");
  const dashboard = document.querySelector(".dom_dashboard");
  const saleDetailUI = document.querySelector(".sale_report");
  const dateUI = document.querySelector(".dom_date");

  if (!wrap || !grouped?.byOwner || !dashboard || !saleDetailUI || !dateUI)
    return;

  // ✅ Nếu chưa có bản gốc → lưu lại
  if (!ORIGINAL_DATA) ORIGINAL_DATA = RAW_DATA;

  const list = Object.entries(grouped.byOwner)
    .map(([owner, data]) => {
      const total = data.total || 0;
      const needed = data.tags?.Needed?.count || 0;
      const considering = data.tags?.Considering?.count || 0;
      const quality = needed + considering;
      const ratio = total > 0 ? ((quality / total) * 100).toFixed(1) : 0;
      return { key: owner, total, quality, ratio: +ratio };
    })
    .sort((a, b) => b.total - a.total);

  wrap.innerHTML = "";

  list.forEach((item) => {
    const cleanName = item.key.replace(/\(NV.*?\)/gi, "").trim();
    let barColor = "rgb(0, 177, 72)";
    if (item.ratio < 20) barColor = "rgb(225, 112, 85)";
    else if (item.ratio < 40) barColor = "rgb(255, 169, 0)";

    const bg = getColorFromName(cleanName);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      cleanName
    )}&background=${bg}&color=fff&bold=true`;

    const html = `
      <li data-owner="${cleanName}">
        <p><img src="${avatar}" class="avatar"/><span>${cleanName}</span></p>
        <p><i class="fa-solid fa-user"></i><span class="total_lead">${
          item.total
        }</span></p>
        <p><i class="fa-solid fa-user-graduate"></i><span class="quality_lead">${
          item.quality
        }</span></p>
        <p class="toplist_percent" style="color:${barColor}; background:rgba(${barColor
      .replace("rgb(", "")
      .replace(")", "")},0.1)">${item.ratio}%</p>
        <p class="toplist_more" title="Lọc theo ${cleanName}"><i class="fa-solid fa-magnifying-glass-chart main_clr"></i></p>
      </li>`;
    wrap.insertAdjacentHTML("beforeend", html);
  });

  // 🔹 Click lọc theo sale
  wrap.querySelectorAll(".toplist_more").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      setSourceActive();
      const li = e.currentTarget.closest("li");
      const saleName = li.dataset.owner;
      if (!saleName) return;
      const leads = GROUPED.byOwner[saleName].leads;
      processAndRenderAll(leads);
      dashboard.classList.add("sale_detail");

      const img = saleDetailUI.querySelector("img");
      const pName = saleDetailUI.querySelector(".dom_selected");
      const calender = saleDetailUI.querySelector(".sale_report_calender");
      if (img)
        img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          saleName
        )}&background=3381c1&color=fff&bold=true`;
      if (pName) pName.innerText = saleName;
      if (calender) calender.innerText = dateUI.innerText;

      const dropdown = saleDetailUI.querySelector(".dom_select_show");
      renderSaleDropdown(dropdown);

      wrap.querySelectorAll("li").forEach((l) => l.classList.remove("active"));
      li.classList.add("active");
    });
  });

  // 🔹 Khi bấm nút “tắt filter” (ở phần sale_detail)
}

// 🔹 Filter sale chính xác tên clean
function filterBySaleExact(saleName) {
  const group = processCRMData(RAW_DATA);
  if (!group?.byOwner) return [];
  const matchedSales = Object.keys(group.byOwner).filter(
    (owner) => owner.replace(/\(NV.*?\)/gi, "").trim() === saleName
  );
  return matchedSales.flatMap((owner) => group.byOwner[owner].leads || []);
}

// 🔹 Render dropdown sale từ dữ liệu tổng
function renderSaleDropdown() {
  let filteredData = RAW_DATA;
  const currentAccount =
    localStorage.getItem("selectedAccount") || "Total Data";
  if (currentAccount === "VTCI") {
    filteredData = RAW_DATA.filter(
      (l) => l.CustomField16Text?.trim().toUpperCase() == "VTCI"
    );
  } else if (currentAccount === "IDEAS") {
    filteredData = RAW_DATA.filter(
      (l) => l.CustomField16Text?.trim().toUpperCase() == "IDEAS"
    );
  }
  const group = processCRMData(filteredData);
  const saleDetailUI = document.querySelector(".sale_report");
  const dropdown = saleDetailUI.querySelector(
    ".saleperson_detail .dom_select_show"
  );
  dropdown.innerHTML = "";

  Object.keys(group.byOwner).forEach((ownerKey) => {
    const name = ownerKey.replace(/\(NV.*?\)/gi, "").trim();
    const bgColor = getColorFromName(name);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name
    )}&background=${bgColor}&color=fff&bold=true`;

    const li = document.createElement("li");
    li.dataset.owner = name;
    li.innerHTML = `<img src="${avatarUrl}"/><span>${name}</span>`;

    // Click chọn sale từ dropdown
    li.addEventListener("click", () => {
      const leads = filterBySaleExact(name);
      processAndRenderAll(leads);
      const saleDetailUI = dropdown.closest(".sale_report");
      const img = saleDetailUI.querySelector("img");
      const pName = saleDetailUI.querySelector(".dom_selected");
      if (img) img.src = avatarUrl;
      if (pName) pName.innerText = name;
    });

    dropdown.appendChild(li);
  });
}

// document.addEventListener("click", (e) => {
//   const btn = e.target.closest(".btn_download_pdf");
//   if (!btn) return;
//   triggerPrintReport();
// });

// function triggerPrintReport() {
//   const report = document.querySelector(".dom_ai_report");
//   if (!report) return alert("⚠️ Không tìm thấy báo cáo!");

//   // 🧩 1️⃣ Thêm class CSS trước khi in
//   report.classList.add("printing");

//   // 🕓 2️⃣ Đợi CSS apply rồi gọi print
//   setTimeout(() => {
//     window.print();

//     // 🧼 3️⃣ Sau khi in xong, gỡ class
//     // (browser không có event “print done”, nên dùng delay nhỏ)
//     setTimeout(() => {
//       report.classList.remove("printing");
//     }, 1000);
//   }, 300);
// }

function setupCompareDropdowns() {
  const compareSelects = document.querySelectorAll(".dom_select.compare");
  if (!compareSelects.length) return;

  compareSelects.forEach((select) => {
    const toggle = select.querySelector(".flex");
    const list = select.querySelector(".dom_select_show");
    const selectedLabel = select.querySelector(".dom_selected");
    const applyBtn = select.querySelector(".apply_custom_date");
    const customBox = select.querySelector(".custom_date");
    const allItems = list.querySelectorAll("li");

    toggle.onclick = (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".dom_select_show")
        .forEach((ul) => ul !== list && ul.classList.remove("active"));
      list.classList.toggle("active");
    };

    allItems.forEach((li) => {
      li.onclick = (e) => {
        e.stopPropagation();
        const type = li.dataset.date;
        if (type === "custom_range") {
          allItems.forEach((i) => i.classList.remove("active"));
          li.classList.add("active");
          customBox.classList.add("show");
          return;
        }

        allItems.forEach((i) => i.classList.remove("active"));
        li.classList.add("active");
        customBox.classList.remove("show");

        const label = li.querySelector("span:last-child").textContent.trim();
        selectedLabel.textContent = label;

        if (select.classList.contains("compare_1")) {
          compareState.range1 = type;
          compareState.custom1 = null;
        } else if (select.classList.contains("compare_2")) {
          compareState.range2 = type;
          compareState.custom2 = null;
        }

        list.classList.remove("active");
      };
    });

    if (applyBtn) {
      applyBtn.onclick = (e) => {
        e.stopPropagation();
        const start = select.querySelector("#start").value;
        const end = select.querySelector("#end").value;
        if (!start || !end)
          return alert("⚠️ Vui lòng chọn đủ ngày bắt đầu và kết thúc!");
        if (new Date(end) <= new Date(start))
          return alert("⚠️ Ngày kết thúc phải sau ngày bắt đầu!");

        selectedLabel.textContent = "Custom Date";
        customBox.classList.remove("show");

        if (select.classList.contains("compare_1")) {
          compareState.range1 = "custom";
          compareState.custom1 = { from: start, to: end };
        } else if (select.classList.contains("compare_2")) {
          compareState.range2 = "custom";
          compareState.custom2 = { from: start, to: end };
        }

        list.classList.remove("active");
      };
    }

    document.addEventListener("click", (e) => {
      if (!select.contains(e.target)) list.classList.remove("active");
    });
  });
}

// 🧭 Khi nhấn nút Compare
// 🧠 Khi user click vào menu Compare
// 🚀 Khi bấm vào menu Compare
// =======================
// ⚙️ HÀM CHÍNH: Load dữ liệu Compare
// =======================
async function loadCompareData(range1, range2) {
  const compareWrap = document.querySelector(".dom_compare");
  const loading = document.querySelector(".loading");
  if (!compareWrap) return alert("⚠️ Không tìm thấy vùng compare!");

  const currentAccount =
    localStorage.getItem("selectedAccount") || "Total Data";
  console.log("📊 Loading compare data for:", currentAccount);

  loading.classList.add("active"); // 🌀 Hiện overlay loading

  try {
    // 🧩 Fetch song song
    const [data1Raw, data2Raw] = await Promise.all([
      fetchLeads(range1.from, range1.to),
      fetchLeads(range2.from, range2.to),
    ]);

    // ✅ Lọc đúng theo account hiện tại
    const data1 = filterByAccount(data1Raw, currentAccount);
    const data2 = filterByAccount(data2Raw, currentAccount);

    // 🧠 Process + Summary
    const g1 = processCRMData(data1);
    const g2 = processCRMData(data2);
    const summary1 = summarizeCompareData(data1, g1);
    const summary2 = summarizeCompareData(data2, g2);

    // 🖼️ Render toàn bộ giao diện Compare
    renderCompareBoxes(compareWrap, summary1, summary2);
    renderCompareTrendChart(g1, g2);
    renderDegreeTableCompare(g1, g2);
    renderProgramChartCompare(g1, g2);
    renderLeadSaleCompare(g1, g2);
    renderLeadTagChartCompare(g1, g2);
    renderLeadTagChartBySaleCompare(g1, g2);
    setupLeadTagChartBySaleCompare(g1, g2);
    renderCompareToplist(g1, g2);

    // 💾 Cache để AI Report Compare có thể dùng
    window.CRM_DATA_1 = data1;
    window.CRM_DATA_2 = data2;
    window.GROUPED_COMPARE_1 = g1;
    window.GROUPED_COMPARE_2 = g2;

    console.log("✅ Compare data loaded & cached for:", currentAccount);
  } catch (err) {
    console.error("❌ Lỗi khi tải Compare:", err);
    alert("Lỗi khi tải dữ liệu so sánh!");
  } finally {
    loading.classList.remove("active"); // 🧩 Ẩn overlay loading sau khi xong
  }
}

// =======================
// 📍 Khi click menu “Compare”
// =======================
let compareLoaded = false;
let lastCompareAccount = null;

// 🧠 Hàm dùng chung để update giao diện ngày + nút
function updateCompareDateUI(range1, range2) {
  const fmtDate = (str) => {
    const d = new Date(str);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const dateText = document.getElementById("compare_date");
  if (dateText) {
    dateText.innerHTML = `
      <span><b><i class="fa-solid fa-circle"></i> Range 1:</b> ${fmtDate(
        range1.from
      )} → ${fmtDate(range1.to)}</span>
      <span><b><i class="fa-solid fa-circle"></i> Range 2:</b> ${fmtDate(
        range2.from
      )} → ${fmtDate(range2.to)}</span>
    `;
  }

  const btnR1 = document.querySelector(".btn-source.rang1");
  const btnR2 = document.querySelector(".btn-source.rang2");
  if (btnR1)
    btnR1.innerHTML = `<i class="fa-solid fa-circle"></i> ${fmtDate(
      range1.from
    )} → ${fmtDate(range1.to)}`;
  if (btnR2)
    btnR2.innerHTML = `<i class="fa-solid fa-circle"></i> ${fmtDate(
      range2.from
    )} → ${fmtDate(range2.to)}`;
}

// ============================
// 📍 Khi mở tab Compare
// ============================
document.addEventListener("click", async (e) => {
  const compareMenu = e.target.closest('[data-view="compare"]');
  if (!compareMenu) return;

  const currentAccount =
    localStorage.getItem("selectedAccount") || "Total Data";

  // 🔁 Nếu account đổi thì reset
  if (currentAccount !== lastCompareAccount) {
    compareLoaded = false;
    lastCompareAccount = currentAccount;
  }

  // ⚙️ Nếu đã load cho account này thì bỏ qua
  if (compareLoaded) return;

  const range1 = getDateRange("last_7days");
  const range2 = getDateRange("previous_7days");

  updateCompareDateUI(range1, range2);
  await loadCompareData(range1, range2);

  compareLoaded = true;
});

// ============================
// 📍 Khi bấm nút Compare
// ============================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#compare_btn");
  if (!btn) return;

  const range1 =
    compareState.range1 === "custom" && compareState.custom1
      ? compareState.custom1
      : getDateRange(compareState.range1);

  const range2 =
    compareState.range2 === "custom" && compareState.custom2
      ? compareState.custom2
      : getDateRange(compareState.range2);

  // 🔒 Giới hạn ngày
  const limitDate = new Date("2025-10-01");
  if (
    new Date(range1.to) < limitDate ||
    new Date(range2.to) < limitDate
  ) {
    alert("⚠️ Ngày phải sau 01/10/2025!");
    return;
  }

  updateCompareDateUI(range1, range2);
  await loadCompareData(range1, range2);
});

// document.addEventListener("click", async (e) => {
//   const menuItem = e.target.closest(".dom_menu li");
//   if (!menuItem) return;

//   const view = menuItem.dataset.view;
//   const loading = document.querySelector(".loading");

//   // 1️⃣ Cập nhật trạng thái menu
//   document
//     .querySelectorAll(".dom_menu li")
//     .forEach((li) => li.classList.toggle("active", li === menuItem));

//   // 2️⃣ Ẩn toàn bộ container trước
//   document.querySelectorAll(".dom_container").forEach((div) => {
//     div.classList.remove("active");
//   });

//   // 3️⃣ Hiển thị đúng container
//   const targetContainer = document.querySelector(`.dom_${view}`);
//   if (targetContainer) {
//     targetContainer.classList.add("active");
//   } else {
//     console.warn(`⚠️ Không tìm thấy .dom_${view}`);
//   }

//   // 4️⃣ Nếu là Compare thì tải dữ liệu
//   if (view === "compare") {
//     loading?.classList.add("active");
//     try {
//       const range1 = getDateRange("last_7days");
//       const range2 = getDateRange("previous_7days");
//       await loadCompareData(range1, range2);
//     } catch (err) {
//       console.error("❌ Lỗi khi tải Compare:", err);
//     } finally {
//       loading?.classList.remove("active");
//     }
//   }

//   console.log("✅ Hiển thị:", view);
// });

// =======================
// 📍 Khi click nút “Compare” (manual refresh)
// =======================

// 🔹 Tổng hợp dữ liệu cơ bản
function summarizeCompareData(data, grouped) {
  if (!data?.length)
    return {
      total: 0,
      qualifiedPct: 0,
      needed: 0,
      considering: 0,
    };

  const total = data.length;
  const needed = grouped.byTag?.Needed?.length || 0;
  const considering = grouped.byTag?.Considering?.length || 0;

  const qualifiedPct = total
    ? (((needed + considering) / total) * 100).toFixed(1)
    : 0;

  return { total, qualifiedPct, needed, considering };
}

function renderCompareBoxes(compareWrap, s1, s2) {
  const boxes = compareWrap.querySelectorAll(".dom_inner.w25.box_shadow.chart");
  if (boxes.length < 2) return;

  // 🧩 Chuẩn hoá dữ liệu
  const normalize = (obj) => ({
    name: obj?.name || "Unknown",
    total: obj?.total ?? 0,
    qualifiedPct: obj?.qualifiedPct ?? 0,
    needed: obj?.needed ?? 0,
    considering: obj?.considering ?? 0,
  });

  // 📊 Hàm tính chênh lệch
  const diffValue = (curr, prev) => {
    const delta = curr - prev;
    const pct = prev === 0 ? 0 : ((delta / prev) * 100).toFixed(1);
    const sign = delta > 0 ? "up" : delta < 0 ? "down" : "equal";
    return { pct, sign, delta };
  };

  // 🎨 Hàm render 1 chỉ số
  const renderField = (el, value, compare, isPercent = false) => {
    if (!el) return;
    const { pct, sign } = compare;
    const valText = isPercent ? `${value}%` : value.toLocaleString();
    const icon =
      sign === "up"
        ? `<i class="fa-solid fa-caret-up"></i>`
        : sign === "down"
        ? `<i class="fa-solid fa-caret-down"></i>`
        : "";
    el.innerHTML = `
      <span class="val">${valText}</span>
      <span class="pct ${sign}">
        ${icon}${pct > 0 ? "+" : ""}${pct}%
      </span>
    `;
  };

  // 🧩 Render 1 box
  const renderOne = (box, current, previous, isReversed = false, inactive = false) => {
    const title = box.querySelector(".chart_title") || box.querySelector("h3");
    const c1 = box.querySelector("ul li:nth-of-type(1) p");
    const c2 = box.querySelector("ul li:nth-of-type(2) p");
    const c3 = box.querySelector("ul li:nth-of-type(3) p");
    const c4 = box.querySelector("ul li:nth-of-type(4) p");

    const data = normalize(current);
    const ref = normalize(previous);

    if (title) title.textContent = data.name;
    if (inactive) box.classList.add("inactive");
    else box.classList.remove("inactive");

    c1.innerHTML = `<span class="val">${data.total.toLocaleString()}</span>`;

    // 🌀 Nếu là box bên phải → đảo dấu ngược lại
    const factor = isReversed ? -1 : 1;

    renderField(
      c2,
      data.qualifiedPct,
      reverseDiff(diffValue(data.qualifiedPct, ref.qualifiedPct), factor),
      true
    );
    renderField(c3, data.needed, reverseDiff(diffValue(data.needed, ref.needed), factor));
    renderField(
      c4,
      data.considering,
      reverseDiff(diffValue(data.considering, ref.considering), factor)
    );
  };

  // 🔄 Đảo chiều tăng/giảm
  const reverseDiff = (d, factor) => {
    if (factor === 1) return d; // giữ nguyên
    const reversedSign = d.sign === "up" ? "down" : d.sign === "down" ? "up" : "equal";
    return { pct: d.pct, sign: reversedSign, delta: -d.delta };
  };

  // 💡 Trường hợp 1 bên không có → clone name và layout bên kia
  const cloneFromOther = (source) => ({
    name: source?.name || "Unknown",
    total: 0,
    qualifiedPct: 0,
    needed: 0,
    considering: 0,
  });

  // 🧠 Tô màu tổng thể
  const highlightBox = (box1, box2, s1, s2) => {
    box1.classList.remove("up", "down", "equal");
    box2.classList.remove("up", "down", "equal");
    const a = s1?.total ?? 0;
    const b = s2?.total ?? 0;
    if (a > b) {
      box1.classList.add("up");
      box2.classList.add("down");
    } else if (a < b) {
      box1.classList.add("down");
      box2.classList.add("up");
    } else {
      box1.classList.add("equal");
      box2.classList.add("equal");
    }
  };

  // 🧩 Chuẩn bị dữ liệu hai bên
  let d1 = s1 ? normalize(s1) : null;
  let d2 = s2 ? normalize(s2) : null;

  if (!d1 && d2) d1 = cloneFromOther(d2);
  if (!d2 && d1) d2 = cloneFromOther(d1);

  // 🔄 Bên trái bình thường, bên phải đảo chiều
  renderOne(boxes[0], d1, d2, false, !s1);
  renderOne(boxes[1], d2, d1, !s2); // đảo chiều nè!
  highlightBox(boxes[0], boxes[1], d1, d2);
}


// 🔹 Vẽ trend chart so sánh 2 giai đoạn
function renderCompareTrendChart(g1, g2) {
  const ctx = document.getElementById("leadTrendChartCompare");
  if (!ctx) return;

  const byDate1 = g1.byDate || {};
  const byDate2 = g2.byDate || {};

  const dates1 = Object.keys(byDate1).sort((a, b) => new Date(a) - new Date(b));
  const dates2 = Object.keys(byDate2).sort((a, b) => new Date(a) - new Date(b));

  const counts1 = dates1.map((d) => byDate1[d]?.total || 0);
  const counts2 = dates2.map((d) => byDate2[d]?.total || 0);

  const ctx2d = ctx.getContext("2d");

  // 🎨 Gradient
  let grad1 = ctx2d.createLinearGradient(0, 0, 0, 400);
  grad1.addColorStop(0, "rgba(255, 171, 0, 0.8)");
  grad1.addColorStop(1, "rgba(255, 171, 0, 0.1)");

  let grad2 = ctx2d.createLinearGradient(0, 0, 0, 400);
  grad2.addColorStop(0, "rgba(38,42,83, 0.8)");
  grad2.addColorStop(1, "rgba(38,42,83, 0.1)");

  // 🔄 Xóa chart cũ nếu có
  if (window.compareChartInstance) window.compareChartInstance.destroy();

  // 🚀 Vẽ chart mới
  window.compareChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates1.length >= dates2.length ? dates1 : dates2,
      datasets: [
        {
          label: "",
          data: counts1,
          backgroundColor: grad1,
          borderColor: "#ffab00",
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "",
          data: counts2,
          backgroundColor: grad2,
          borderColor: "#262a53",
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      elements: { line: { borderJoinStyle: "round" } },
      plugins: {
        legend: { display: false }, // ✅ Ẩn chú thích
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#555", maxTicksLimit: 10 },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#666",
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v),
          },
          grid: { color: "rgba(0,0,0,0.05)" },
          afterDataLimits: (scale) => (scale.max *= 1.05),
        },
      },
    },
  });
}
function renderDegreeTableCompare(g1, g2) {
  const wrap = document.getElementById("degreeChartCompare");
  if (!wrap) return;

  const data1 = Array.isArray(g1)
    ? g1
    : Object.values(g1.byOwner || {}).flatMap((o) => o.leads || []);
  const data2 = Array.isArray(g2)
    ? g2
    : Object.values(g2.byOwner || {}).flatMap((o) => o.leads || []);

  if (!data1.length && !data2.length) {
    wrap.innerHTML =
      "<p style='text-align:center;color:#999'>Không có dữ liệu</p>";
    return;
  }

  const regex = {
    duoiCD: /(dưới[\s_]*cao[\s_]*đẳng|duoi[\s_]*cao[\s_]*dang)/i,
    caoDang: /(cao[\s_]*đẳng|cao[\s_]*dang)/i,
    thpt: /thpt/i,
    sinhVien: /(sinh[\s_]*viên|sinh[\s_]*vien|sinhvien)/i,
    cuNhan: /(cử[\s_]*nhân|cu[\s_]*nhan)/i,
    thacSi: /(thạc[\s_]*sĩ|thac[\s_]*si)/i,
  };

  const initDegrees = () => ({
    "Cử nhân": 0,
    "Cao đẳng": 0,
    "Dưới cao đẳng": 0,
    THPT: 0,
    "Sinh viên": 0,
    "Thạc sĩ": 0,
    Khác: 0,
  });

  const countDegrees = (data) => {
    const deg = initDegrees();
    const descs = data.map((d) => (d.Description ? d.Description.toLowerCase() : ""));
    for (let i = 0; i < descs.length; i++) {
      const desc = descs[i];
      if (!desc.trim()) continue;
      if (regex.duoiCD.test(desc)) deg["Dưới cao đẳng"]++;
      else if (regex.caoDang.test(desc)) deg["Cao đẳng"]++;
      else if (regex.thpt.test(desc)) deg["THPT"]++;
      else if (regex.cuNhan.test(desc)) deg["Cử nhân"]++;
      else if (regex.sinhVien.test(desc)) deg["Sinh viên"]++;
      else if (regex.thacSi.test(desc)) deg["Thạc sĩ"]++;
      else deg["Khác"]++;
    }
    return deg;
  };

  const degPrev = countDegrees(data1); // kỳ 1
  const degCurr = countDegrees(data2); // kỳ 2

  const labels = Object.keys(degPrev);

  const rows = labels
    .map((label) => {
      const prev = degPrev[label] || 0;
      const curr = degCurr[label] || 0;
      const diff = prev - curr; // 🔁 đảo chiều: kỳ 1 - kỳ 2
      const trendClass = diff > 0 ? "up" : diff < 0 ? "down" : "";
      const arrow =
        diff > 0
          ? `<i class="fa-solid fa-caret-up"></i> <span class="up">+${diff}</span>`
          : diff < 0
          ? `<i class="fa-solid fa-caret-down"></i> <span class="down">${diff}</span>`
          : "-";

      return `
        <tr class="${trendClass}">
          <td>${label}</td>
          <td style="text-align:center">${prev}</td>
          <td style="text-align:center">${curr}</td>
          <td style="text-align:center">${arrow}</td>
        </tr>
      `;
    })
    .join("");

  wrap.innerHTML = `
    <table class="mini_table">
      <thead>
        <tr>
          <th>Trình độ</th>
          <th>Range 1</th>
          <th>Range 2</th>
          <th>Biến động</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderProgramChartCompare(g1, g2) {
  const ctx = document.getElementById("programChartCompare");
  if (!ctx) return;

  // ✅ Lấy tần suất tag của 2 giai đoạn
  const freq1 = g1?.tagFrequency || {};
  const freq2 = g2?.tagFrequency || {};

  // ✅ Gom dữ liệu chương trình giống hệt hàm gốc
  const programs = [
    ["MSc AI UMEF", freq1["Msc_AI UMEF"] || 0, freq2["Msc_AI UMEF"] || 0],
    ["MBA UMEF", freq1["MBA UMEF"] || 0, freq2["MBA UMEF"] || 0],
    ["EMBA UMEF", freq1["EMBA UMEF"] || 0, freq2["EMBA UMEF"] || 0],
    ["BBA", freq1["BBA"] || 0, freq2["BBA"] || 0],
    ["DBA", freq1["DBA"] || 0, freq2["DBA"] || 0],
  ].filter(([_, v1, v2]) => v1 > 0 || v2 > 0); // ✅ chỉ giữ khi có data

  if (!programs.length) {
    if (window.programChartCompareInstance) {
      window.programChartCompareInstance.destroy();
      window.programChartCompareInstance = null;
    }
    return;
  }

  // ✅ Chuẩn bị labels & values
  const labels = programs.map(([name]) => name);
  const values1 = programs.map(([_, v1]) => v1);
  const values2 = programs.map(([_, __, v2]) => v2);

  const maxValue = Math.max(...values1, ...values2);

  // 🎨 Màu
  const color1 = "rgba(255, 171, 0, 0.9)";
  const color2 = "rgba(38,42,83, 0.9)";

  // 🔄 Nếu chart đã tồn tại → update nhanh
  if (window.programChartCompareInstance) {
    const chart = window.programChartCompareInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values1;
    chart.data.datasets[1].data = values2;
    chart.update("none");
    return;
  }

  // 🚀 Tạo chart mới
  window.programChartCompareInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "",
          data: values1,
          backgroundColor: color1,
          borderSkipped: "bottom",
          borderRadius: {
            topLeft: 6,
            topRight: 6,
            bottomLeft: 0,
            bottomRight: 0,
          },
        },
        {
          label: "",
          data: values2,
          backgroundColor: color2,
          borderSkipped: "bottom",
          borderRadius: {
            topLeft: 6,
            topRight: 6,
            bottomLeft: 0,
            bottomRight: 0,
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutCubic" },
      plugins: {
        legend: { display: false }, // ✅ ẩn legend
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) =>
              `${ctx.datasetIndex === 0 ? "Period 1" : "Period 2"}: ${
                ctx.parsed.y
              } leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          color: "#333",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#555", font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#666",
            font: { size: 11 },
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

function renderLeadTagChartCompare(g1, g2) {
  const ctx = document.getElementById("leadTagChartCompare");
  if (!ctx || !g1?.byTag || !g2?.byTag) return;

  const tags = new Set([...Object.keys(g1.byTag), ...Object.keys(g2.byTag)]);
  if (!tags.size) return;

  const labels = Array.from(tags);
  const values1 = labels.map((tag) => g1.byTag[tag]?.length || 0);
  const values2 = labels.map((tag) => g2.byTag[tag]?.length || 0);
  const maxValue = Math.max(...values1, ...values2);

  const color1 = "rgba(255, 183, 40, 0.36)";
  const color2 = "rgba(78, 83, 136, 0.3)";
  const border1 = "rgba(255, 183, 40, 0.5)";
  const border2 = "rgba(78, 83, 136, 0.5)";
  if (window.leadTagChartCompareInstance) {
    const chart = window.leadTagChartCompareInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values1;
    chart.data.datasets[1].data = values2;
  
    // 🧠 Cập nhật lại max scale theo dữ liệu mới (không nâng max, không thập phân)
    chart.options.scales.r.max = Math.ceil(maxValue);
    chart.options.scales.r.ticks.stepSize = Math.ceil(maxValue / 4) || 1;
    chart.options.scales.r.ticks.callback = (v) => Number.isInteger(v) ? v : ""; // chỉ hiện số nguyên
  
    chart.update("none");
    return;
  }
  
  
  window.leadTagChartCompareInstance = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Period 1",
          data: values1,
          backgroundColor: color1,
          borderColor: border1,
          borderWidth: 2,
          pointBackgroundColor: border1,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Period 2",
          data: values2,
          backgroundColor: color2,
          borderColor: border2,
          borderWidth: 2,
          pointBackgroundColor: border2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: "easeOutCubic" },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.r} leads`,
          },
        },
        // ❌ Tắt hiển thị số ở chấm
        datalabels: {
          display: false,
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: maxValue,
          ticks: {
            stepSize: Math.ceil(maxValue / 4) || 1,
            color: "#555",
            showLabelBackdrop: false,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          grid: { color: "rgba(0,0,0,0.08)" },
          angleLines: { color: "rgba(0,0,0,0.08)" },
          pointLabels: {
            font: { size: 12, weight: "500" },
            color: "#333",
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

// 🧩 Hàm lọc dữ liệu theo account hiện tại
function filterByAccount(data, account) {
  if (!data?.length) return [];

  // 🧩 Nếu chọn "Total Data" thì không lọc
  if (account === "Total Data") return data;

  // 🧩 Lấy toàn bộ danh sách account từ HTML
  const accElements = document.querySelectorAll("ul.box_shadow li[data-acc]");
  const accList = Array.from(accElements).map(li =>
    li.getAttribute("data-acc").trim().toUpperCase()
  );

  // 🧩 Nếu account được chọn hợp lệ trong danh sách
  if (accList.includes(account.toUpperCase())) {
    return data.filter(
      (l) => l.CustomField16Text?.trim().toUpperCase() === account.toUpperCase()
    );
  }

  // 🔹 Nếu không match gì, trả lại toàn bộ
  return data;
}


function renderLeadSaleCompare(g1, g2) {
  if (!g1?.byOwner || !g2?.byOwner) return;

  const ctx = document.getElementById("leadSaleCompare");
  if (!ctx) return;

  const byOwner1 = g1.byOwner;
  const byOwner2 = g2.byOwner;

  const allOwners = Array.from(
    new Set([...Object.keys(byOwner1), ...Object.keys(byOwner2)])
  );

  const labels = [];
  const counts1 = [];
  const counts2 = [];

  for (const owner of allOwners) {
    const cleanName = owner.replace(/\s*\(NV.*?\)/gi, "").trim();
    labels.push(cleanName);
    counts1.push(byOwner1[owner]?.total || 0);
    counts2.push(byOwner2[owner]?.total || 0);
  }

  const maxValue = Math.max(...counts1, ...counts2);
  const ctx2d = ctx.getContext("2d");
  const color1 = "rgba(255, 171, 0, 0.8)";
  const color2 = "rgba(38, 42, 83, 0.8)";

  if (window.leadSaleCompareInstance) {
    const chart = window.leadSaleCompareInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = counts1;
    chart.data.datasets[1].data = counts2;
    chart.update();
    return;
  }

  window.leadSaleCompareInstance = new Chart(ctx2d, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: counts1,
          backgroundColor: color1,
          borderColor: color1.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: { topLeft: 5, topRight: 5 },
        },
        {
          data: counts2,
          backgroundColor: color2,
          borderColor: color2.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: { topLeft: 5, topRight: 5 },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: false,
      plugins: {
        legend: { display: false }, // ✅ bỏ label
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: { color: "#444", autoSkip: true, maxTicksLimit: 10 },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) =>
              v >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toLocaleString(),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

function renderLeadTagChartBySaleCompare(g1, g2, saleName) {
  const ctx = document.getElementById("leadTagChartbySaleCompare");
  if (!ctx) return;

  const findOwner = (group, name) =>
    Object.keys(group.byOwner || {}).find(
      (k) => k.replace(/\s*\(NV.*?\)/gi, "").trim() === name
    );

  const key1 = findOwner(g1, saleName);
  const key2 = findOwner(g2, saleName);
  const owner1 = g1.byOwner[key1] || {};
  const owner2 = g2.byOwner[key2] || {};

  const tagOrder = [
    "Considering",
    "Needed",
    "Bad timing",
    "Unqualified",
    "Junk",
    "New",
    "Untag",
  ];

  const labels = [];
  const data1 = [];
  const data2 = [];

  for (let tag of tagOrder) {
    const v1 = owner1.tags?.[tag]?.count || 0;
    const v2 = owner2.tags?.[tag]?.count || 0;
    if (v1 > 0 || v2 > 0) {
      labels.push(tag);
      data1.push(v1);
      data2.push(v2);
    }
  }

  const maxValue = Math.max(...data1, ...data2);
  const color1 = "rgba(255, 171, 0, 0.8)";
  const color2 = "rgba(38, 42, 83, 0.8)";

  if (window.leadTagChartBySaleCompareInstance) {
    const chart = window.leadTagChartBySaleCompareInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = data1;
    chart.data.datasets[1].data = data2;
    chart.update();
    return;
  }

  window.leadTagChartBySaleCompareInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: data1,
          backgroundColor: color1,
          borderColor: color1.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: { topLeft: 6, topRight: 6 },
          barPercentage: 0.8,
          categoryPercentage: 0.5,
        },
        {
          data: data2,
          backgroundColor: color2,
          borderColor: color2.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: { topLeft: 6, topRight: 6 },
          barPercentage: 0.8,
          categoryPercentage: 0.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300, easing: "easeOutQuad" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false }, // ✅ bỏ label
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          color: "#333",
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: {
            color: "rgba(0,0,0,0.05)",
            drawTicks: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "#555" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) =>
              v >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toLocaleString(),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
          grid: { color: "rgba(0,0,0,0.05)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

function setupLeadTagChartBySaleCompare(g1, g2) {
  const selectWrap = document.querySelector(
    ".dom_select.sale_tag_chart_compare"
  );
  if (!selectWrap) return;

  const dropdown = selectWrap.querySelector(".dom_select_show");
  const selected = selectWrap.querySelector(".dom_selected");
  if (!g1?.byOwner && !g2?.byOwner) return;

  // 🧮 Lấy danh sách sale từ cả 2 kỳ, loại bỏ mã NV
  const sales = Array.from(
    new Set([
      ...Object.keys(g1.byOwner || {}),
      ...Object.keys(g2.byOwner || {}),
    ])
  ).map((n) => n.replace(/\s*\(NV.*?\)/gi, "").trim());

  const defaultSale = sales[0];

  // 🧹 Render danh sách sale
  dropdown.innerHTML = sales
    .map(
      (s) => `
      <li class="${s === defaultSale ? "active" : ""}">
        <span class="radio_box ${s === defaultSale ? "active" : ""}"></span>
        <span>${s}</span>
      </li>
    `
    )
    .join("");

  // ✅ Hiển thị mặc định
  selected.textContent = defaultSale;
  renderLeadTagChartBySaleCompare(g1, g2, defaultSale);

  // 🟡 Toggle dropdown
  const toggle = selectWrap.querySelector(".flex");
  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dom_select_show.active").forEach((u) => {
        if (u !== dropdown) u.classList.remove("active");
      });
      dropdown.classList.toggle("active");
    });
  }

  // ✅ Dùng event delegation (1 listener duy nhất)
  if (!dropdown.dataset.bound) {
    dropdown.dataset.bound = "1";
    dropdown.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (!li) return;

      // Bỏ active cũ
      dropdown
        .querySelectorAll("li")
        .forEach((el) => el.classList.remove("active"));
      dropdown
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));

      // Active mới
      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      const saleName = li.querySelector("span:nth-child(2)").textContent.trim();
      selected.textContent = saleName;

      // Cập nhật biểu đồ Compare
      renderLeadTagChartBySaleCompare(g1, g2, saleName);

      dropdown.classList.remove("active");
    });
  }

  // 🔹 Click ngoài để đóng (gán 1 lần duy nhất)
  if (!document._saleTagCompareOutside) {
    document.addEventListener("click", (e) => {
      if (!selectWrap.contains(e.target)) dropdown.classList.remove("active");
    });
    document._saleTagCompareOutside = true;
  }
}

function generateAdvancedCompareReport() {
  const reportWrap = document.querySelector(".dom_ai_report");
  if (!reportWrap)
    return console.warn("Không tìm thấy .dom_ai_report trong DOM.");

  const content = reportWrap.querySelector(".dom_ai_report_content");
  const title = reportWrap.querySelector("h3");

  // ✅ Lấy nguyên 2 thẻ <span> bên trong <p id="compare_date">
  const dateEl = document.querySelector("#compare_date");
  const dateHTML = dateEl ? dateEl.innerHTML.trim() : "";

  const currentAccount =
    localStorage.getItem("selectedAccount") || "Total Data";

  // 🏷️ Cập nhật tiêu đề
  if (title)
    title.innerHTML = `
    <p><img src="./logotarget.png"><span>CRM COMPARE REPORT</span></p>
    ${
      dateHTML
        ? `<p class="report_time" id="compare_render">${dateHTML}</p>`
        : ""
    }
  `;

  // 🧠 Gom theo chi nhánh
  const buildCompareGrouped = (keyword) => {
    const data1 = (window.CRM_DATA_1 || []).filter(
      (l) => (l.CustomField16Text || "").trim().toUpperCase() === keyword
    );
    const data2 = (window.CRM_DATA_2 || []).filter(
      (l) => (l.CustomField16Text || "").trim().toUpperCase() === keyword
    );
    return {
      org: keyword,
      grouped1: processCRMData(data1),
      grouped2: processCRMData(data2),
      data1,
      data2,
    };
  };

  // ⚙️ Chuẩn bị dữ liệu theo từng tổ chức
  const ideas = buildCompareGrouped("IDEAS");
  const vtci = buildCompareGrouped("VTCI");

  let html = "";

  // 🎯 Tùy theo account hiện tại mà render đúng phần
  if (currentAccount === "IDEAS") {
    const ideasHTML = makeDeepCompareReport(
      ideas.grouped1,
      ideas.grouped2,
      ideas.data1,
      ideas.data2,
      "IDEAS"
    );
    html = `
      <div class="ai_report_block ideas">
        <h4><img src="https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp"/>IDEAS – So sánh 2 kỳ</h4>
        <div class="ai_report_inner">${ideasHTML}</div>
      </div>`;
  } else if (currentAccount === "VTCI") {
    const vtciHTML = makeDeepCompareReport(
      vtci.grouped1,
      vtci.grouped2,
      vtci.data1,
      vtci.data2,
      "VTCI"
    );
    html = `
      <div class="ai_report_block vtci">
        <h4><img src="https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp"/>VTCI – So sánh 2 kỳ</h4>
        <div class="ai_report_inner">${vtciHTML}</div>
      </div>`;
  } else {

    // 🧩 Total Data → render cả 2 khối
    const ideasHTML = makeDeepCompareReport(
      ideas.grouped1,
      ideas.grouped2,
      ideas.data1,
      ideas.data2,
      "IDEAS"
    );
    const vtciHTML = makeDeepCompareReport(
      vtci.grouped1,
      vtci.grouped2,
      vtci.data1,
      vtci.data2,
      "VTCI"
    );

    html = `
      <div class="ai_report_block ideas">
        <h4><img src="https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp"/>IDEAS – So sánh 2 kỳ</h4>
        <div class="ai_report_inner">${ideasHTML}</div>
      </div>
      <div class="ai_report_block vtci">
        <h4><img src="https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp"/>VTCI – So sánh 2 kỳ</h4>
        <div class="ai_report_inner">${vtciHTML}</div>
      </div>`;
  }

  // 🧱 Render vào content
  if (content) content.innerHTML = html;
  setTimeout(() => {
    const wrap = document.querySelector(".dom_ai_report");
    if (!wrap) return;
    wrap.querySelectorAll(".fade_in_item").forEach((el, i) => {
      setTimeout(() => el.classList.add("show"), i * 300);
    });
  }, 3000);
}
function renderCompareToplist(grouped1, grouped2) {
  const wrap1 = document.querySelector(".compare_ads_1 .dom_toplist");
  const wrap2 = document.querySelector(".compare_ads_2 .dom_toplist");
  if (!wrap1 || !wrap2)
    return console.warn("Không tìm thấy compare_ads_1 hoặc compare_ads_2.");

  wrap1.innerHTML = "";
  wrap2.innerHTML = "";

  // 🔹 Dựng list
  const buildList = (grouped) => {
    const list = [];
    if (!grouped?.byCampaign) return list;
    for (const [campaign, sources] of Object.entries(grouped.byCampaign)) {
      for (const [source, mediums] of Object.entries(sources)) {
        for (const [medium, leads] of Object.entries(mediums)) {
          const total = leads.length;
          const needed = leads.filter((l) => l.TagMain === "Needed").length;
          const considering = leads.filter((l) => l.TagMain === "Considering").length;
          const quality = needed + considering;
          const ratio = total ? (quality / total) * 100 : 0;
          list.push({
            key: `${campaign}|${source}|${medium}`,
            campaign,
            source,
            medium,
            total,
            quality,
            ratio: +ratio.toFixed(1),
          });
        }
      }
    }
    return list;
  };

  const list1 = buildList(grouped1);
  const list2 = buildList(grouped2);

  const allKeys = Array.from(
    new Set([...list1.map((x) => x.key), ...list2.map((x) => x.key)])
  );

  const getLogo = (key) => {
    const logos = [
      { match: /facebook|fb/i, url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Logo_de_Facebook.png/1200px-Logo_de_Facebook.png" },
      { match: /google/i, url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png" },
      { match: /linkedin/i, url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/1024px-LinkedIn_icon.svg.png" },
      { match: /tiktok/i, url: "https://www.logo.wine/a/logo/TikTok/TikTok-Icon-White-Dark-Background-Logo.wine.svg" },
      { match: /Web IDEAS/i, url: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp" },
      { match: /Web VTCI/i, url: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp" },
    ];
    const logo = logos.find((x) => x.match.test(key));
    return logo
      ? logo.url
      : "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp";
  };

  const compareList = allKeys.map((key) => {
    const a = list1.find((x) => x.key === key);
    const b = list2.find((x) => x.key === key);
    const diff = (a?.ratio || 0) - (b?.ratio || 0);
    return { key, a, b, diff, absDiff: Math.abs(diff) };
  });

  compareList.sort((x, y) => {
    if (x.a && x.b && y.a && y.b) return y.a.total - x.a.total;
    if (x.a && !x.b) return 1;
    if (!x.a && y.b) return 1;
    return y.absDiff - x.absDiff;
  });

  const renderItem = (data, cls = "") => {
    let color = "rgb(0, 177, 72)";
    if (data.ratio < 20) color = "rgb(225, 112, 85)";
    else if (data.ratio < 40) color = "rgb(255, 169, 0)";
    const rgba = color.replace("rgb(", "").replace(")", "");
    return `
    <li class="${cls}" data-campaign="${data.campaign}" data-source="${data.source}" data-medium="${data.medium}">
      <p><img src="${getLogo(data.key)}"/><span>${data.campaign} - ${data.source} - ${data.medium}</span></p>
      <p><i class="fa-solid fa-user"></i><span>${data.total}</span></p>
      <p><i class="fa-solid fa-user-graduate"></i><span>${data.quality}</span></p>
      <p class="toplist_percent" style="color:${color}; background:rgba(${rgba},0.1)">${data.ratio}%</p>
    </li>`;
  };

  compareList.forEach((item) => {
    let a = item.a;
    let b = item.b;

    if (!a && b) {
      a = { ...b, total: 0, quality: 0, ratio: 0 };
    }
    if (!b && a) {
      b = { ...a, total: 0, quality: 0, ratio: 0 };
    }

    // 🟩 Xác định class up/down/inactive
    let classA = "";
    let classB = "";

    if (!item.a) classA = "inactive";
    if (!item.b) classB = "inactive";

    if (a && b) {
      if (a.total > b.total) {
        classA += " up";
        classB += " down";
      } else if (a.total < b.total) {
        classA += " down";
        classB += " up";
      }
    }

    wrap1.insertAdjacentHTML("beforeend", renderItem(a, classA.trim()));
    wrap2.insertAdjacentHTML("beforeend", renderItem(b, classB.trim()));
  });
}

function makeDeepCompareReport(g1, g2, d1, d2, orgName = "ORG") {
  if (!g1?.byOwner || !g2?.byOwner)
    return `<p class="warn fade_in_item delay-1">⚠️ Không có dữ liệu Compare cho ${orgName}.</p>`;

  const fmt = (v) => (isNaN(v) ? "0" : parseFloat(v).toFixed(1));
  const makeIcon = (val) =>
    val > 0
      ? `<i class="fa-solid fa-caret-up" style="color:#00b248"></i>`
      : val < 0
      ? `<i class="fa-solid fa-caret-down" style="color:#e17055"></i>`
      : `<i class="fa-solid fa-minus" style="color:#999"></i>`;

  // ====== Logo cache ======
  const logoMap = new Map([
    [
      "facebook",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Logo_de_Facebook.png/1200px-Logo_de_Facebook.png",
    ],
    [
      "google",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png",
    ],
    [
      "tiktok",
      "https://www.logo.wine/a/logo/TikTok/TikTok-Icon-White-Dark-Background-Logo.wine.svg",
    ],
    [
      "linkedin",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/1024px-LinkedIn_icon.svg.png",
    ],
    [
      "zalo",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Zalo_logo_2021.svg/512px-Zalo_logo_2021.svg.png",
    ],
    [
      "vtci",
      "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    ],
    [
      "ideas",
      "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    ],
  ]);

  const getPlatformKey = (txt = "") => {
    const t = txt.toLowerCase();
    if (t.includes("facebook") || t.includes("fb")) return "facebook";
    if (t.includes("google")) return "google";
    if (t.includes("tiktok")) return "tiktok";
    if (t.includes("linkedin")) return "linkedin";
    if (t.includes("zalo")) return "zalo";
    if (t.includes("vtci")) return "vtci";
    if (t.includes("ideas") || t.includes("web")) return "ideas";
    return null;
  };

  const makePlatformAvatar = (source = "") => {
    const key = getPlatformKey(source);
    const logo = key ? logoMap.get(key) : null;
    if (logo)
      return `<div class="camp_logo"><img src="${logo}" alt="${source}" loading="lazy"></div>`;
    let hash = 0;
    for (let i = 0; i < source.length; i++)
      hash = source.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    const bg = `hsl(${h},70%,65%)`;
    return `<div class="camp_logo" style="background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;border-radius:50%;width:40px;height:40px;">${source
      .slice(0, 2)
      .toUpperCase()}</div>`;
  };

  const getColorFromName = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++)
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360},70%,65%)`;
  };
  const getInitials = (name) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  // ======= Tổng lead và Qualified =======
  const totalCurr = d1.length,
    totalPrev = d2.length,
    diff = totalCurr - totalPrev,
    pct = totalPrev ? ((diff / totalPrev) * 100).toFixed(1) : 0,
    goodCurr =
      (g1.byTag?.Needed?.length || 0) + (g1.byTag?.Considering?.length || 0),
    goodPrev =
      (g2.byTag?.Needed?.length || 0) + (g2.byTag?.Considering?.length || 0),
    rateCurr = totalCurr ? ((goodCurr / totalCurr) * 100).toFixed(1) : 0,
    ratePrev = totalPrev ? ((goodPrev / totalPrev) * 100).toFixed(1) : 0,
    rateDiff = rateCurr - ratePrev;

  // ======= Phân tích theo Sale =======
  const owners = new Set([
    ...Object.keys(g1.byOwner),
    ...Object.keys(g2.byOwner),
  ]);
  const saleDiffs = [];
  owners.forEach((s) => {
    const clean = s.replace(/\s*\(NV.*?\)/gi, "").trim();
    const curr = g1.byOwner[s] || {},
      prev = g2.byOwner[s] || {};
    const totalCurr = curr.total || 0,
      totalPrev = prev.total || 0;
    const neededCurr = curr.tags?.Needed?.count || 0,
      consideringCurr = curr.tags?.Considering?.count || 0,
      qualifiedCurr = neededCurr + consideringCurr;
    const neededPrev = prev.tags?.Needed?.count || 0,
      consideringPrev = prev.tags?.Considering?.count || 0,
      qualifiedPrev = neededPrev + consideringPrev;
    const diffTotal = totalCurr - totalPrev;
    const rateCurr = totalCurr ? (qualifiedCurr / totalCurr) * 100 : 0;
    const ratePrev = totalPrev ? (qualifiedPrev / totalPrev) * 100 : 0;
    saleDiffs.push({
      sale: clean,
      totalCurr,
      totalPrev,
      diffTotal,
      rateCurr: fmt(rateCurr),
      ratePrev: fmt(ratePrev),
      rateDiff: fmt(rateCurr - ratePrev),
    });
  });

  const pickTop = (arr, key, up = true) => {
    let best = null;
    for (const s of arr) {
      if (s[key] === 0) continue;
      if (!best || (up ? s[key] > best[key] : s[key] < best[key])) best = s;
    }
    return best;
  };

  const topUp = pickTop(saleDiffs, "diffTotal", true);
  const topDown = pickTop(saleDiffs, "diffTotal", false);
  const topRateUp = pickTop(saleDiffs, "rateDiff", true);
  const topRateDown = pickTop(saleDiffs, "rateDiff", false);

  // ======= Campaign compare =======
  const tagGood = /Needed|Considering/i;
  const buildCampaignList = (g) => {
    const out = [];
    for (const camp in g.byCampaign) {
      const srcs = g.byCampaign[camp];
      for (const src in srcs) {
        const meds = srcs[src];
        for (const m in meds) {
          const arr = meds[m];
          const total = arr.length;
          const q = arr.filter((l) => tagGood.test(l.TagMain)).length;
          out.push({
            campaign: camp,
            source: src,
            medium: m,
            total,
            ratio: total ? (q / total) * 100 : 0,
          });
        }
      }
    }
    return out;
  };

  const list1 = buildCampaignList(g1),
    list2 = buildCampaignList(g2),
    keyMap = new Map();

  for (const a of list1) keyMap.set(a.campaign + a.source + a.medium, { a });
  for (const b of list2) {
    const k = b.campaign + b.source + b.medium;
    const v = keyMap.get(k) || {};
    v.b = b;
    keyMap.set(k, v);
  }

  const compareList = [];
  keyMap.forEach((x) =>
    compareList.push({
      ...x,
      diff: (x.a?.total || 0) - (x.b?.total || 0),
    })
  );

  const pickTopCamp = (cmp, key = "diff", up = true) => {
    let best = null;
    for (const x of cmp) {
      if (!x[key]) continue;
      if (!best || (up ? x[key] > best[key] : x[key] < best[key])) best = x;
    }
    return best || {};
  };

  const pickTopRate = (cmp, up = true) => {
    let best = null;
    for (const x of cmp) {
      const diff = (x.a?.ratio || 0) - (x.b?.ratio || 0);
      if (diff === 0) continue;
      if (!best || (up ? diff > best.diff : diff < best.diff))
        best = { ...x, diff };
    }
    return best || {};
  };

  const topCampUp = pickTopCamp(compareList, "diff", true);
  const topCampDown = pickTopCamp(compareList, "diff", false);
  const topRateCampUp = pickTopRate(compareList, true);
  const topRateCampDown = pickTopRate(compareList, false);

  // ======= Tag & Program & Degree Compare =======
  const makeCompareArr = (a1, a2) => {
    const set = new Set([...Object.keys(a1 || {}), ...Object.keys(a2 || {})]);
    const out = [];
    set.forEach((k) => {
      const v1 = a1[k]?.length || a1[k] || 0;
      const v2 = a2[k]?.length || a2[k] || 0;
      const diff = v1 - v2;
      const pct = v2 ? ((diff / v2) * 100).toFixed(1) : 0;
      out.push({ key: k, v1, v2, diff, pct });
    });
    return out;
  };

  // ✅ Tag Overview (giữ nguyên logic)
  const tagCompare = makeCompareArr(g1.byTag, g2.byTag);

  // ✅ Program Summary (lọc chỉ 5 chương trình chính)
  const freq1 = g1?.tagFrequency || {};
  const freq2 = g2?.tagFrequency || {};
  const programKeys = ["Msc_AI UMEF", "MBA UMEF", "EMBA UMEF", "BBA", "DBA"];

  const programCompare = programKeys
    .map((k) => {
      const v1 = freq1[k] || 0;
      const v2 = freq2[k] || 0;
      const diff = v1 - v2;
      const pct = v2 ? ((diff / v2) * 100).toFixed(1) : 0;
      return { key: k.replace(/_/g, " "), v1, v2, diff, pct };
    })
    .filter((x) => x.v1 > 0 || x.v2 > 0); // chỉ giữ khi có data

  const detectDegree = (txt) => {
    const t = txt.toLowerCase();
    if (/dưới.*cao.*đẳng/.test(t)) return "Dưới cao đẳng";
    if (/cao.*đẳng/.test(t)) return "Cao đẳng";
    if (/thpt/.test(t)) return "THPT";
    if (/sinh.*viên/.test(t)) return "Sinh viên";
    if (/cử.*nhân/.test(t)) return "Cử nhân";
    if (/thạc.*sĩ/.test(t)) return "Thạc sĩ";
    return "Khác";
  };
  const countDegree = (arr) => {
    const out = {};
    for (const l of arr) {
      const deg = detectDegree(l.Description || l.CustomField5Text || "");
      out[deg] = (out[deg] || 0) + 1;
    }
    return out;
  };
  const degreeCompare = makeCompareArr(countDegree(d1), countDegree(d2));

  const miniTable = (title, arr, keyName, delay = 0) => {
    if (!arr?.length) return "";
    const rows = arr
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5)
      .map(
        (x) => `
        <tr>
          <td>${x.key}</td><td>${x.v1}</td><td>${x.v2}</td>
          <td>${x.diff > 0 ? "+" : ""}${x.diff}</td>
          <td>${x.pct}% ${makeIcon(x.diff)}</td>
        </tr>`
      )
      .join("");
    return `
      <div class="fade_in_item delay-${delay}">
        <h6>${title}</h6>
        <table class="mini_table">
          <thead><tr><th>${keyName}</th><th>Range 1</th><th>Range 2</th><th>±</th><th>%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  };

  const insightHTML = `
    <li>${makeIcon(diff)} Tổng lead ${diff > 0 ? "tăng" : "giảm"} (${fmt(
    pct
  )}%).</li>
    <li>${makeIcon(rateDiff)} Tỷ lệ Qualified ${
    rateDiff > 0 ? "tăng" : "giảm"
  } (${fmt(rateDiff)}%).</li>
  `;

  return `
  <section class="ai_section fade_in_block">
    <h5 class="fade_in_item delay-1"><i class="fa-solid fa-chart-simple"></i> ${orgName} Overview</h5>
    <ul class="insight_list fade_in_item delay-2">
      <li><b>Total Leads:</b> ${totalCurr} vs ${totalPrev} (${fmt(
    pct
  )}%) ${makeIcon(diff)}</li>
      <li><b>Qualified%:</b> ${rateCurr}% vs ${ratePrev}% (${fmt(
    rateDiff
  )}%) ${makeIcon(rateDiff)}</li>
    </ul>

    <h5 class="fade_in_item delay-3"><i class="fa-solid fa-user-tie"></i> Sales Summary</h5>
    <ul class="ai_sale_list fade_in_item delay-4">
      ${
        topUp
          ? `<li><div class="sale_item"><div class="sale_avatar" style="background:${getColorFromName(
              topUp.sale
            )}">${getInitials(
              topUp.sale
            )}</div><div class="sale_info"><p><strong>Tăng mạnh:</strong>${
              topUp.sale
            }</p><p>${topUp.totalCurr} vs ${topUp.totalPrev} leads ${makeIcon(
              topUp.diffTotal
            )}</p></div></div></li>`
          : ""
      }
      ${
        topDown
          ? `<li><div class="sale_item"><div class="sale_avatar" style="background:${getColorFromName(
              topDown.sale
            )}">${getInitials(
              topDown.sale
            )}</div><div class="sale_info"><p><strong>Giảm nhiều:</strong>${
              topDown.sale
            }</p><p>${topDown.totalCurr} vs ${
              topDown.totalPrev
            } leads ${makeIcon(topDown.diffTotal)}</p></div></div></li>`
          : ""
      }
      ${
        topRateUp
          ? `<li><div class="sale_item"><div class="sale_avatar" style="background:${getColorFromName(
              topRateUp.sale
            )}">${getInitials(
              topRateUp.sale
            )}</div><div class="sale_info"><p><strong>%Qualified tăng mạnh:</strong>${
              topRateUp.sale
            }</p><p>${topRateUp.rateCurr}% vs ${topRateUp.ratePrev}% ${makeIcon(
              topRateUp.rateDiff
            )}</p></div></div></li>`
          : ""
      }
      ${
        topRateDown
          ? `<li><div class="sale_item"><div class="sale_avatar" style="background:${getColorFromName(
              topRateDown.sale
            )}">${getInitials(
              topRateDown.sale
            )}</div><div class="sale_info"><p><strong>%Qualified giảm mạnh:</strong>${
              topRateDown.sale
            }</p><p>${topRateDown.rateCurr}% vs ${
              topRateDown.ratePrev
            }% ${makeIcon(topRateDown.rateDiff)}</p></div></div></li>`
          : ""
      }
    </ul>

    <h5 class="fade_in_item delay-5"><i class="fa-solid fa-bullhorn"></i> Ads Channel Performance</h5>
    <ul class="ai_campaign_list fade_in_item delay-6">
      ${
        topCampUp.a
          ? `<li><div class="camp_item">${makePlatformAvatar(
              topCampUp.a.source
            )}<div class="camp_info"><p><strong>Chiến dịch tăng mạnh:</strong>${
              topCampUp.a.campaign
            }</p><p>${topCampUp.a.source}/${
              topCampUp.a.medium
            }</p></div><div class="camp_stats"><span>${fmt(
              topCampUp.a.total
            )} vs ${fmt(topCampUp.b?.total || 0)} leads ${makeIcon(
              topCampUp.diff
            )}</span></div></div></li>`
          : ""
      }
      ${
        topCampDown.a
          ? `<li><div class="camp_item">${makePlatformAvatar(
              topCampDown.a.source
            )}<div class="camp_info"><p><strong>Chiến dịch giảm mạnh:</strong>${
              topCampDown.a.campaign
            }</p><p>${topCampDown.a.source}/${
              topCampDown.a.medium
            }</p></div><div class="camp_stats"><span>${fmt(
              topCampDown.a.total
            )} vs ${fmt(topCampDown.b?.total || 0)} leads ${makeIcon(
              topCampDown.diff
            )}</span></div></div></li>`
          : ""
      }
      ${
        topRateCampUp.a
          ? `<li><div class="camp_item">${makePlatformAvatar(
              topRateCampUp.a.source
            )}<div class="camp_info"><p><strong>Kênh có %Qualified tăng mạnh nhất:</strong>${
              topRateCampUp.a.campaign
            }</p><p>${topRateCampUp.a.source}/${
              topRateCampUp.a.medium
            }</p></div><div class="camp_stats"><span>${fmt(
              topRateCampUp.a.ratio
            )}% vs ${fmt(topRateCampUp.b?.ratio || 0)}% ${makeIcon(
              topRateCampUp.diff
            )}</span></div></div></li>`
          : ""
      }
      ${
        topRateCampDown.a
          ? `<li><div class="camp_item">${makePlatformAvatar(
              topRateCampDown.a.source
            )}<div class="camp_info"><p><strong>Kênh có %Qualified giảm mạnh nhất:</strong>${
              topRateCampDown.a.campaign
            }</p><p>${topRateCampDown.a.source}/${
              topRateCampDown.a.medium
            }</p></div><div class="camp_stats"><span>${fmt(
              topRateCampDown.a.ratio
            )}% vs ${fmt(topRateCampDown.b?.ratio || 0)}% ${makeIcon(
              topRateCampDown.diff
            )}</span></div></div></li>`
          : ""
      }
    </ul>

    <h5 class="fade_in_item delay-7"><i class="fa-solid fa-graduation-cap"></i> Program & Degree</h5>
    ${miniTable("Program Summary", programCompare, "Program", 8)}
    ${miniTable("Degree Summary", degreeCompare, "Degree", 9)}

    <h5 class="fade_in_item delay-10"><i class="fa-solid fa-tag"></i> Tag Overview</h5>
    ${miniTable("Lead Tag Summary", tagCompare, "Tag", 11)}

    <h5 class="fade_in_item delay-12"><i class="fa-solid fa-lightbulb"></i> Insights</h5>
    <ul class="insight_list fade_in_item delay-13">${insightHTML}</ul>
  </section>`;
}

