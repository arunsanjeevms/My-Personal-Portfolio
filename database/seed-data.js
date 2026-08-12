'use strict';

/**
 * Portfolio content extracted verbatim from index.html.
 *
 * This is the migration payload for `npm run seed`. Every string here was
 * copied from the original static site - nothing is invented, reworded or
 * embellished. Where the site rendered a free-text date ("Apr 2026 -
 * Present", "NPTEL"), it is preserved in `date_label` so the rendered
 * output is identical.
 */

module.exports = {
  // ------------------------------------------------------------ profile
  profile: {
    full_name: 'M S Arun Sanjeev',
    display_name: 'Arun Sanjeev',
    professional_title: 'Pre-Final Year CSE Student',
    secondary_title: '3x National Hackathon Winner',
    short_bio: 'Full Stack Developer, AI Builder, and Cyber Security Enthusiast.',
    email: 'msarunsanjeev@gmail.com',
    email_subject: 'Hey There..! I have visited your Website',
    email_body: "Welcome! I'm thrilled to see you you. Whether you’re here to communicate me. I'm here to make your experience delightful.",
    phone: '+91 94926 33000',
    whatsapp_url: 'https://wa.link/j2bdyj',
    birthday: '2005-08-13',
    location_html: 'Namakkal, Tamil Nadu, India',
    city: 'Namakkal',
    state: 'Tamil Nadu',
    country: 'India',
    show_email: 1,
    show_phone: 1,
    show_birthday: 1,
    show_location: 1,
    resume_label: 'Download Resume',
    // Preserved as-is from the original markup, including the bullet
    // arrows and non-breaking spaces that produce the current layout.
    about_html: `<p>&nbsp;&nbsp; &nbsp; &nbsp; &nbsp;Hello! I’m <b>M S ARUN SANJEEV</b>, a Pre-Final Year Computer Science
and Engineering student at M Kumarasamy College of Engineering and a <b>3X National Hackathon Winner</b>. I am focused on building secure,
scalable, and intelligent digital solutions with practical impact.
<br><b><br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;➤ &nbsp;&nbsp; Fullstack Development:</b> I build complete web
applications, handling both frontend interfaces and backend systems to deliver reliable end-to-end products.
<br><br><b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;➤ &nbsp;&nbsp; Cloud Deployment:</b> I deploy and manage
applications on cloud platforms with attention to scalability, availability, and performance.
<br><br><b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;➤ &nbsp;&nbsp; Cyber Security:</b> I work on securing
applications and infrastructure through testing, hardening, and proactive risk mitigation.
<br><br><b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;➤ &nbsp;&nbsp; Artificial Intelligence:</b> I explore and develop
AI-powered solutions that automate workflows and improve decision-making.</p>`,
  },

  // ------------------------------------------------------------ social
  socialLinks: [
    { platform: 'LinkedIn', url: 'https://www.linkedin.com/in/arunsanjeev/', icon_name: 'logo-linkedin', username: 'arunsanjeev' },
    { platform: 'GitHub', url: 'https://github.com/arunsanjeevms', icon_name: 'logo-github', username: 'arunsanjeevms' },
    { platform: 'WhatsApp', url: 'https://wa.link/j2bdyj', icon_name: 'logo-whatsapp', include_in_jsonld: 0 },
    { platform: 'Medium', url: 'https://medium.com/@msarunsanjeev', icon_name: 'logo-medium', username: '@msarunsanjeev' },
    { platform: 'Instagram', url: 'https://www.instagram.com/arun_sanjeev._/', icon_name: 'logo-instagram', username: 'arun_sanjeev._' },
  ],

  // -------------------------------------------------------- navigation
  navigation: [
    { label: 'About', target_page: 'about', link_type: 'page' },
    { label: 'Resume', target_page: 'resume', link_type: 'page' },
    { label: 'Projects', target_page: 'projects', link_type: 'page' },
    { label: 'Blog', target_page: 'blog', link_type: 'page' },
    { label: 'Contact', target_page: 'contact', link_type: 'page' },
  ],

  // ---------------------------------------------------------- services
  // The first card uses an <img> SVG; the rest use <ion-icon>.
  services: [
    {
      title: 'Fullstack Development',
      description: 'End-to-end web application development with modern frontend and backend technologies.',
      icon_type: 'image',
      icon_alt: 'Web development icon',
      legacy_icon: './assets/images/icon-dev.svg',
    },
    {
      title: 'Cloud Deployment',
      description: 'Deployment and hosting of applications on cloud platforms with reliable delivery.',
      icon_type: 'ionicon',
      icon_name: 'cloud-upload-outline',
    },
    {
      title: 'Cyber Security',
      description: 'Security-focused development, testing, and protection of digital systems and data.',
      icon_type: 'ionicon',
      icon_name: 'lock-closed-outline',
    },
    {
      title: 'Artificial Intelligence',
      description: 'Building AI-driven features and intelligent automation for real-world applications.',
      icon_type: 'ionicon',
      icon_name: 'hardware-chip-outline',
    },
  ],

  // --------------------------------------------------------- education
  education: [
    {
      institution: 'M Kumarasamy College Of Engieering - Karur',
      date_label: '2023-2027',
      description: 'Joined Bachelor of Engineering in Computer Science and Engineering.',
      start_year: 2023,
      end_year: 2027,
      is_current: 1,
      degree: 'Bachelor of Engineering',
      field: 'Computer Science and Engineering',
    },
    {
      institution: 'Government Higher Secondary School - 91.3%',
      date_label: 'Higher Secondary Education',
      description: 'I acquired fundamental knowledge Biology-Mathematics during my Higher Secondary Education.',
      grade: '91.3%',
    },
  ],

  // -------------------------------------------------------- experience
  experience: [
    {
      position: 'Associate Student Ambassador',
      company: 'Microsoft',
      date_label: 'Apr 2026 - Present',
      is_current: 1,
      employment_type: 'volunteer',
      description: 'Currently serving as an Associate Student Ambassador, leading campus-focused technology initiatives, mentoring peers, and enabling students to grow through Microsoft learning opportunities.',
    },
    {
      position: 'Vice Chair',
      company: 'IEEE Systems, Man, and Cybernetics Society (SMCS)',
      date_label: '2026',
      is_current: 1,
      employment_type: 'volunteer',
      description: 'Serving as Vice Chair, I support chapter leadership, coordinate technical initiatives, and drive member engagement through collaborative events and community programs.',
    },
    {
      position: 'Microsoft Learn Student Ambassador (Beta)',
      company: 'Microsoft',
      date_label: 'Sep 2025 - Apr 2026',
      employment_type: 'volunteer',
      description: 'Reached the Beta milestone by contributing to technical community engagement, delivering learning sessions, and demonstrating technical leadership in student-led activities.',
    },
    {
      position: 'Microsoft Student Ambassador (Alpha)',
      company: 'Microsoft',
      date_label: 'Jul 2025 - Sep 2025',
      employment_type: 'volunteer',
      description: 'Began my MLSA journey as an Alpha ambassador, helping fellow students build technical and career skills while supporting the growth of an active campus tech community.',
    },
    {
      position: 'Member',
      company: 'Technical Innovation Hub',
      date_label: '2025',
      employment_type: 'volunteer',
      description: 'As a member of the Technical Innovation Hub, I collaborate on innovative projects, participate in technical workshops, and contribute to fostering a culture of creativity and problem-solving within the student community.',
    },
    {
      position: 'Campus Ambassador',
      company: 'Unstop',
      date_label: '2025',
      employment_type: 'volunteer',
      description: 'As an Unstop Campus Ambassador, I facilitate student participation in competitions, promote career opportunities, and encourage skill development through strategic outreach and engagement.',
    },
    {
      position: 'Campus Ambassador',
      company: 'GeeksforGeeks',
      date_label: '2024',
      employment_type: 'volunteer',
      description: 'As a Campus Ambassador for GeeksforGeeks, I actively promote coding culture, facilitate technical workshops, and guide students to leverage resources for skill enhancement.',
    },
    {
      position: 'Campus Ambassador',
      company: 'MyGov India',
      date_label: '2024',
      employment_type: 'volunteer',
      description: 'As a MyGov Campus Ambassador, I have contributed to promoting government initiatives, driving student engagement, and fostering awareness about national campaigns through strategic outreach and digital advocacy.',
    },
    {
      position: 'Student Partner',
      company: 'Internshala',
      date_label: '2024',
      employment_type: 'volunteer',
      description: 'As a Student Partner at Internshala, I facilitated student registrations, spread awareness about internship opportunities, and encouraged peers to enhance their professional skills.',
    },
    {
      position: 'Campus Ambassador',
      company: 'LetsUpgrade',
      date_label: '2024',
      employment_type: 'volunteer',
      description: 'As a Campus Ambassador for LetsUpgrade, I played a key role in promoting technology-driven learning programs and engaging students in upskilling opportunities within a short-term role.',
    },
    {
      position: 'Campus Ambassador',
      company: 'E-Cell, IIT Bombay',
      date_label: '2024',
      employment_type: 'volunteer',
      description: 'As a Campus Ambassador for E-Cell, IIT Bombay, I engage in promoting entrepreneurship, organizing events, and connecting students with startup ecosystems to nurture entrepreneurial mindsets.',
    },
    {
      position: 'Student Ambassador',
      company: 'Techfest, IIT Bombay',
      date_label: '2024',
      employment_type: 'volunteer',
      description: 'As a Student Ambassador for Techfest, IIT Bombay, I contribute to increasing event outreach, managing student participation, and promoting technological advancements through strategic engagement.',
    },
    {
      position: 'Marketing Intern',
      company: 'LanguifyAI',
      date_label: '2024',
      employment_type: 'internship',
      description: 'As a Marketing Intern at LanguifyAI, I support brand growth through content strategies, digital marketing initiatives, and student outreach programs to enhance platform visibility.',
    },
  ],

  // ------------------------------------------------------ achievements
  achievements: [
    { title: 'Winner - AI Ascend 2026 (AWS & Kyndryl)', date_label: 'Mar 2026', achieved_on: '2026-03-01', category: 'Hackathon', is_featured: 1, description: 'Won AI Ascend 2026, a major innovation challenge conducted by AWS and Kyndryl.' },
    { title: 'Winner - Prathiyogitha Volume 2 (24-Hour Hackathon)', date_label: 'Jan 2026', achieved_on: '2026-01-01', category: 'Hackathon', is_featured: 1, organization: 'Kongu Engineering College', description: 'Secured first place in Prathiyogitha Volume 2, a 24-hour hackathon hosted by Kongu Engineering College.' },
    { title: 'Runner-up - MKCE HackFest 2026', date_label: 'Feb 2026', achieved_on: '2026-02-01', category: 'Hackathon', organization: 'MKCE', description: 'Achieved runner-up position at MKCE HackFest 2026 through strong project execution and teamwork.' },
    { title: 'Winner - GenCraft 2026 Hackathon', date_label: 'Dec 2025', achieved_on: '2025-12-01', category: 'Hackathon', is_featured: 1, description: 'Won the GenCraft 2026 Hackathon by developing an impactful and innovative solution.' },
    { title: 'Winner - GenCraft 2026 Appathon', date_label: 'Dec 2025', achieved_on: '2025-12-01', category: 'Hackathon', description: 'Secured first place in the GenCraft 2026 Appathon for building a high-quality application prototype.' },
    { title: 'Winner - Orlia 2026 Memes Mania', date_label: 'Mar 2026', achieved_on: '2026-03-01', category: 'Competition', description: 'Won Orlia 2026 Memes Mania by showcasing creativity and effective communication through visual content.' },
    { title: 'Captured Flag @ SYSTECH CTF', date_label: 'Aug 2024', achieved_on: '2024-08-01', category: 'Cyber Security', organization: 'SYSTECH', description: 'Successfully captured the flag in a cybersecurity competition conducted by SYSTECH, demonstrating problem-solving abilities, ethical hacking skills, and strategic thinking in cybersecurity challenges.' },
    { title: 'Won 2nd Prize in Poster Designing @ MKCE', date_label: 'Sep 2024', achieved_on: '2024-09-01', category: 'Competition', organization: 'MKCE', description: 'Achieved 2nd place in the poster designing competition at MKCE, showcasing creativity, design thinking, and effective visual communication on technical and social themes.' },
    { title: 'Won 3rd Prize in CodeWars @ MKCE', date_label: 'Oct 2024', achieved_on: '2024-10-01', category: 'Competition', organization: 'MKCE', description: 'Secured 3rd place in the CodeWars coding competition at MKCE, demonstrating proficiency in problem-solving, algorithmic thinking, and coding efficiency under competitive conditions.' },
    { title: 'Student of the Month @ MKCE', date_label: 'Jul 2024', achieved_on: '2024-07-01', category: 'Recognition', organization: 'MKCE', description: 'Recognized as the Student of the Month at MKCE for outstanding academic performance, leadership skills, and active participation in college events and technical activities.' },
  ],

  // ----------------------------------------------------- certifications
  certifications: [
    { name: 'NPTEL - Introduction to Industry 4.0 & Industrial IoT, IIT Kharagpur', issuer: 'NPTEL / IIT Kharagpur', date_label: '2025', description: 'Completed the NPTEL course on Industry 4.0 and Industrial IoT from IIT Kharagpur, covering smart manufacturing systems, connected devices, and modern industrial automation concepts.' },
    { name: 'NPTEL - Ethical Hacking', issuer: 'NPTEL', date_label: 'NPTEL', description: 'Completed the NPTEL Ethical Hacking course, gaining practical understanding of security testing, vulnerability assessment, and responsible cybersecurity practices.' },
    { name: 'NPTEL - Responsible AI and Safe Systems', issuer: 'NPTEL', date_label: 'NPTEL', description: 'Completed the NPTEL course on Responsible AI and Safe Systems, focusing on trustworthy AI principles, safety considerations, and ethical deployment of intelligent systems.' },
    { name: 'IBM Enterprise Design Thinking Co-Creator', issuer: 'IBM', date_label: '2025', description: 'Achieved IBM Enterprise Design Thinking Co-Creator certification, demonstrating expertise in collaborative design processes, user-centered thinking, and innovative problem-solving methodologies for enterprise solutions.' },
    { name: 'IBM Enterprise Design Thinking Practitioner', issuer: 'IBM', date_label: '2025', description: 'Completed IBM Enterprise Design Thinking Practitioner certification, gaining proficiency in applying design thinking principles, facilitating workshops, and driving human-centered innovation in enterprise environments.' },
    { name: 'Overview of Data Visualization - Coursera', issuer: 'Coursera', date_label: '2025', description: 'Completed the Overview of Data Visualization course on Coursera, acquiring foundational knowledge in data visualization principles, tools, and techniques for effective data storytelling and insights communication.' },
    { name: 'Postman API Fundamentals Student Expert Certification', issuer: 'Postman', date_label: '2024', is_featured: 1, description: 'Certified as a Postman API Fundamentals Student Expert, demonstrating expertise in API testing, automation, and best practices in API development.' },
    { name: 'GitHub Foundations Certification', issuer: 'GitHub', date_label: '2024', is_featured: 1, description: 'Achieved the GitHub Foundations Certificate, demonstrating proficiency in version control, collaborative development, and repository management.' },
    { name: 'Google Cybersecurity Specialization', issuer: 'Google / Coursera', date_label: '2024', is_featured: 1, description: 'Completed Google Cybersecurity Specialization on Coursera, covering topics such as risk management, threat analysis, and security operations, achieving high scores across various modules.' },
    { name: 'TATA Cybersecurity Certificate @ The Forage', issuer: 'TATA / The Forage', date_label: '2024', description: 'Completed the TATA Cybersecurity Virtual certification via The Forage, gaining practical exposure to cybersecurity principles and industry-standard tools.' },
    { name: 'HP Certifications', issuer: 'HP', date_label: '2024', description: 'Earned certifications from HP in Effective Leadership, AI for Beginners, Cyber Security awarness, and Data Science & Analytics, enhancing my skills in technology-driven domains.' },
    { name: 'CISCO Junior Cybersecurity Analyst Path', issuer: 'Cisco', date_label: '2024', description: 'Accomplished the CISCO Junior Cybersecurity Analyst Path, equipping myself with the foundational knowledge required for entry-level cybersecurity roles.' },
    { name: 'Master Data Management for Beginners @ TCS iON', issuer: 'TCS iON', date_label: '2025', description: 'Completed the Master Data Management for Beginners course, gaining foundational knowledge in data governance, data quality, and integration strategies.' },
    { name: 'IoT Certificate @ FireChip Academy', issuer: 'FireChip Academy', date_label: '2024', description: 'Completed an IoT certification from FireChip Academy, acquiring knowledge in sensor integration, IoT protocols, and data analysis.' },
    { name: 'Vultr Cloud Innovate Hackathon', issuer: 'Vultr', date_label: '2024', description: 'Participated in the Vultr Cloud Innovate Hackathon, leveraging cloud computing solutions to develop innovative projects and solutions.' },
  ],

  // ------------------------------------------------------------ skills
  // The site renders discrete .level-N bars, not percentages.
  skillCategory: { name: 'Core Expertise', slug: 'core-expertise' },
  skills: [
    { name: 'Fullstack Development (Frontend + Backend)', slug: 'fullstack-development', level: 5, aria_label: 'Fullstack proficiency level' },
    { name: 'Cloud Deployment & DevOps', slug: 'cloud-deployment-devops', level: 4, aria_label: 'Cloud proficiency level' },
    { name: 'Cyber Security & VAPT', slug: 'cyber-security-vapt', level: 4, aria_label: 'Cybersecurity proficiency level' },
    { name: 'Artificial Intelligence Integration', slug: 'artificial-intelligence-integration', level: 4, aria_label: 'AI proficiency level' },
    { name: 'Hackathon Execution & Team Leadership', slug: 'hackathon-execution-team-leadership', level: 5, aria_label: 'Leadership proficiency level' },
  ],

  // ------------------------------------------------- project categories
  // Slugs must match the data-category values used by the filter script.
  projectCategories: [
    { name: 'Cyber Security', slug: 'cyber security' },
    { name: 'Applications', slug: 'applications' },
    { name: 'Web development', slug: 'web development' },
    { name: 'AI Projects', slug: 'ai projects' },
  ],

  // ---------------------------------------------------------- projects
  projects: [
    { title: 'My Portfolio Site V2', slug: 'my-portfolio-site-v2', category: 'web development', category_label: 'Web development', primary_url: 'https://tinyurl.com/visitmethere', legacy_image: './assets/images/Projects/portfolio.png', image_alt: 'portfoliosite' },
    { title: 'Bus Reservation System', slug: 'bus-reservation-system', category: 'applications', category_label: 'Applications - HTML, CSS, PHP (DBMS Project)', primary_url: 'https://github.com/arunsanjeevms/Bus_Reservation_System', github_url: 'https://github.com/arunsanjeevms/Bus_Reservation_System', legacy_image: './assets/images/Projects/bus.jpg', image_alt: 'Bus Reservation System' },
    { title: 'College Management System', slug: 'college-management-system', category: 'applications', category_label: 'Applications - Java', primary_url: 'https://github.com/arunsanjeevms/College-Management-System', github_url: 'https://github.com/arunsanjeevms/College-Management-System', legacy_image: './assets/images/cms.gif', image_alt: 'CMS' },
    { title: 'PDF Password Bruteforce Tool', slug: 'pdf-password-bruteforce-tool', category: 'cyber security', category_label: 'Cyber Security', primary_url: 'https://github.com/arunsanjeevms/PDF-Bruteforce', github_url: 'https://github.com/arunsanjeevms/PDF-Bruteforce', legacy_image: './assets/images/Projects/pdf.jpg', image_alt: 'PDF-Bruteforce' },
    { title: 'Telegram Bot', slug: 'telegram-bot', category: 'cyber security', category_label: 'Cyber Security', primary_url: 'https://github.com/arunsanjeevms/Telegrambot_Python', github_url: 'https://github.com/arunsanjeevms/Telegrambot_Python', legacy_image: './assets/images/Projects/tele.jpg', image_alt: 'Telegram BOt' },
    { title: 'Compound Interest Calculator', slug: 'compound-interest-calculator', category: 'web development', category_label: 'Web development', primary_url: 'https://github.com/arunsanjeevms/Compound-Interest-Calculator-with-Graph', github_url: 'https://github.com/arunsanjeevms/Compound-Interest-Calculator-with-Graph', legacy_image: './assets/images/Projects/Compound Interest Calculator.png', image_alt: 'compound-interest-calculator' },
    { title: 'SENSAN Website', slug: 'sensan-website', category: 'web development', category_label: 'Web development', primary_url: 'https://arunsanjeevms.github.io/SENSAN/', live_url: 'https://arunsanjeevms.github.io/SENSAN/', legacy_image: './assets/images/Projects/sensan.png', image_alt: 'sensan' },
    { title: 'Thiran Link', slug: 'thiran-link', category: 'web development', category_label: 'Web development', primary_url: 'https://arunsanjeevms.github.io/ThiranLink/', live_url: 'https://arunsanjeevms.github.io/ThiranLink/', legacy_image: './assets/images/Projects/thiran.png', image_alt: 'thiran-link' },
    { title: 'Digispark Scripts', slug: 'digispark-scripts', category: 'cyber security', category_label: 'Cyber Security', primary_url: 'https://github.com/arunsanjeevms/Digispark-Scripts', github_url: 'https://github.com/arunsanjeevms/Digispark-Scripts', legacy_image: './assets/images/Projects/digispark.png', image_alt: 'Digispark Scripts' },
    { title: 'AI-Based-Rain-Alert-for-MKCE', slug: 'ai-based-rain-alert-for-mkce', category: 'ai projects', category_label: 'AI Projects', primary_url: 'https://github.com/arunsanjeevms/AI-Based-Rain-Alert-for-MKCE', github_url: 'https://github.com/arunsanjeevms/AI-Based-Rain-Alert-for-MKCE', legacy_image: './assets/images/Projects/rain.png', image_alt: 'rain alert' },
    { title: 'RAG-LLM', slug: 'rag-llm', category: 'ai projects', category_label: 'AI Projects', primary_url: 'https://github.com/arunsanjeevms/RAG-LLM', github_url: 'https://github.com/arunsanjeevms/RAG-LLM', legacy_image: './assets/images/Projects/rag.jpg', image_alt: 'rag model' },
    { title: 'Trust Trade', slug: 'trust-trade', category: 'ai projects', category_label: 'AI Projects', primary_url: 'https://github.com/arunsanjeevms', legacy_image: './assets/images/project-1.jpg', image_alt: 'Trust Trade' },
    { title: 'Life Link', slug: 'life-link', category: 'ai projects', category_label: 'AI Projects', primary_url: 'https://github.com/arunsanjeevms', legacy_image: './assets/images/project-2.png', image_alt: 'Life Link' },
    { title: 'Hostel Management System', slug: 'hostel-management-system', category: 'applications', category_label: 'Applications - Full Stack (Live, 1K+ Users)', primary_url: 'https://github.com/arunsanjeevms', legacy_image: './assets/images/project-3.jpg', image_alt: 'Hostel Management System', is_featured: 1 },
    { title: 'Credixia - Finance Management App', slug: 'credixia-finance-management-app', category: 'applications', category_label: 'Applications - Full Stack (Live)', primary_url: 'https://github.com/arunsanjeevms', legacy_image: './assets/images/project-4.png', image_alt: 'Credixia', is_featured: 1 },
    { title: 'digsafe - IoT', slug: 'digsafe-iot', category: 'applications', category_label: 'Applications - IoT', primary_url: 'https://github.com/arunsanjeevms', legacy_image: './assets/images/project-5.png', image_alt: 'digsafe' },
    { title: 'GPA Calculator Web Browser Extension', slug: 'gpa-calculator-web-browser-extension', category: 'applications', category_label: 'Applications - Launched in Microsoft Store', primary_url: 'https://microsoftedge.microsoft.com/addons', legacy_image: './assets/images/project-6.png', image_alt: 'GPA Calculator Web Browser Extension' },
  ],
};
