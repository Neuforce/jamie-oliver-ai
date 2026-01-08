import svgPaths from "./svg-21d7e0ylmn";
import imgImage10 from "figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png";
import imgEllipse1 from "figma:asset/d46ab3d52593263ad77f849925632cd26f53bc05.png";

function Notch() {
  return (
    <div className="absolute h-[32px] left-1/2 top-0 translate-x-[-50%] w-[172px]" data-name="Notch">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 172 32">
        <g id="Notch">
          <path d={svgPaths.p29d69840} fill="var(--fill-0, black)" id="notch" />
        </g>
      </svg>
    </div>
  );
}

function StatusBarTime() {
  return (
    <div className="absolute h-[21px] left-[calc(16.67%-11px)] rounded-[24px] top-[14px] translate-x-[-50%] w-[54px]" data-name="_StatusBar-time">
      <p className="absolute font-['SF_Pro_Text:Semibold',sans-serif] h-[20px] leading-[21px] left-[27px] not-italic text-[16px] text-black text-center top-px tracking-[-0.32px] translate-x-[-50%] w-[54px]">9:41</p>
    </div>
  );
}

function LeftSide() {
  return (
    <div className="absolute contents left-[calc(16.67%-11px)] top-[14px] translate-x-[-50%]" data-name="Left Side">
      <StatusBarTime />
    </div>
  );
}

function RightSide() {
  return (
    <div className="absolute h-[13px] left-[calc(83.33%-0.3px)] top-[19px] translate-x-[-50%] w-[77.401px]" data-name="Right Side">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 78 13">
        <g id="Right Side">
          <g id="_StatusBar-battery">
            <path d={svgPaths.p26f34780} id="Outline" opacity="0.35" stroke="var(--stroke-0, black)" />
            <path d={svgPaths.p4c0c710} fill="var(--fill-0, black)" id="Battery End" opacity="0.4" />
            <path d={svgPaths.p22239c00} fill="var(--fill-0, black)" id="Fill" />
          </g>
          <path d={svgPaths.p12f99c80} fill="var(--fill-0, black)" id="Wifi" />
          <g id="Icon / Mobile Signal">
            <path d={svgPaths.p16816b00} fill="var(--fill-0, black)" />
            <path d={svgPaths.p18ef7a00} fill="var(--fill-0, black)" />
            <path d={svgPaths.p2262f080} fill="var(--fill-0, black)" />
            <path d={svgPaths.pc5da680} fill="var(--fill-0, black)" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="h-[47px] overflow-clip relative shrink-0 w-[390px]" data-name="StatusBar">
      <Notch />
      <LeftSide />
      <RightSide />
    </div>
  );
}

function TopNavigation() {
  return (
    <div className="absolute backdrop-blur-[10px] backdrop-filter bg-white content-stretch flex flex-col gap-[2px] items-start left-0 top-0" data-name="TopNavigation">
      <div aria-hidden="true" className="absolute border-[0px_0px_0.5px] border-[rgba(60,60,67,0.36)] border-solid inset-[0_0_-0.25px_0] pointer-events-none" />
      <StatusBar />
    </div>
  );
}

function Menu() {
  return (
    <div className="absolute left-[11px] size-[24px] top-[16px]" data-name="menu">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="menu">
          <path d="M4 8H20M4 16H20" id="Vector" stroke="var(--stroke-0, #327179)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function Nav() {
  return (
    <div className="bg-white h-[56px] relative rounded-bl-[16px] rounded-br-[16px] shrink-0 w-[390px]" data-name="Nav">
      <Menu />
      <div className="absolute h-[24px] left-[110px] top-[16px] w-[171.75px]" data-name="image 10">
        <img alt="" className="absolute inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgImage10} />
      </div>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute h-[442px] left-[-4px] top-[142px] w-[394px]">
      <div className="absolute inset-[-22.62%_-25.38%]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 594 642">
          <g id="Group 2">
            <g filter="url(#filter0_f_25_4345)" id="Ellipse 3">
              <circle cx="297" cy="297" fill="url(#paint0_radial_25_4345)" fillOpacity="0.3" r="197" />
            </g>
            <g filter="url(#filter1_f_25_4345)" id="Ellipse 4">
              <circle cx="338.5" cy="386.5" fill="url(#paint1_radial_25_4345)" fillOpacity="0.3" r="135.5" />
            </g>
            <g filter="url(#filter2_f_25_4345)" id="Ellipse 5">
              <circle cx="222.5" cy="464.5" fill="url(#paint2_radial_25_4345)" r="77.5" />
            </g>
          </g>
          <defs>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="594" id="filter0_f_25_4345" width="594" x="0" y="0">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
              <feGaussianBlur result="effect1_foregroundBlur_25_4345" stdDeviation="42" />
            </filter>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="471" id="filter1_f_25_4345" width="471" x="103" y="151">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
              <feGaussianBlur result="effect1_foregroundBlur_25_4345" stdDeviation="42" />
            </filter>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="355" id="filter2_f_25_4345" width="355" x="45" y="287">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
              <feGaussianBlur result="effect1_foregroundBlur_25_4345" stdDeviation="42" />
            </filter>
            <radialGradient cx="0" cy="0" gradientTransform="translate(297 297) rotate(90) scale(197)" gradientUnits="userSpaceOnUse" id="paint0_radial_25_4345" r="1">
              <stop offset="0.629808" stopColor="white" />
              <stop offset="0.740385" stopColor="#48C6B1" />
              <stop offset="1" stopColor="#F0FF17" />
            </radialGradient>
            <radialGradient cx="0" cy="0" gradientTransform="translate(338.5 386.5) rotate(90) scale(135.5)" gradientUnits="userSpaceOnUse" id="paint1_radial_25_4345" r="1">
              <stop stopColor="#81EB67" />
              <stop offset="1" stopColor="white" />
            </radialGradient>
            <radialGradient cx="0" cy="0" gradientTransform="translate(222.5 464.5) rotate(90) scale(77.5)" gradientUnits="userSpaceOnUse" id="paint2_radial_25_4345" r="1">
              <stop stopColor="#F0FF17" />
              <stop offset="1" stopColor="white" />
            </radialGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function Glow() {
  return (
    <div className="absolute content-stretch flex flex-col h-[742px] items-center justify-center left-0 pb-0 pt-[32px] px-[20px] top-0 w-[390px]" data-name="Glow">
      <Group />
    </div>
  );
}

function Text() {
  return (
    <div className="content-stretch flex items-center justify-center pb-0 pt-px px-0 relative shrink-0" data-name="Text">
      <p className="font-['Work_Sans:Regular',sans-serif] font-normal leading-[21px] relative shrink-0 text-[#5d5d5d] text-[16px] text-nowrap">Search recipes by name, ingredie...</p>
    </div>
  );
}

function Search() {
  return (
    <div className="relative shrink-0 size-[24px]" data-name="search">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="search">
          <path d={svgPaths.p1716d280} id="Vector" stroke="var(--stroke-0, #327179)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function Search1() {
  return (
    <div className="bg-white relative rounded-[25px] shrink-0 w-full" data-name="Search">
      <div className="flex flex-row items-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[8px] items-center px-[12px] py-[9px] relative w-full">
          <Text />
          <Search />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[25px]" />
    </div>
  );
}

function Frame() {
  return (
    <div className="relative shrink-0 w-full">
      <div className="size-full">
        <div className="content-stretch flex flex-col items-start px-[30px] py-0 relative w-full">
          <Search1 />
        </div>
      </div>
    </div>
  );
}

function Top() {
  return (
    <div className="content-stretch flex flex-col gap-[24px] items-center relative shrink-0 w-full" data-name="Top">
      <div className="relative shrink-0 size-[170px]">
        <div className="absolute inset-[-10%]">
          <img alt="" className="block max-w-none size-full" height="204" src={imgEllipse1} width="204" />
        </div>
      </div>
      <Frame />
    </div>
  );
}

function Icon() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p19d57600} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M2 6H14" id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M2 10H14" id="Vector_3" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M6 2V14" id="Vector_4" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M10 2V14" id="Vector_5" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button() {
  return (
    <div className="basis-0 bg-[#46bea8] content-stretch flex grow h-[32px] items-center justify-center min-h-px min-w-px relative rounded-[3.35544e+07px] shrink-0" data-name="Button">
      <Icon />
    </div>
  );
}

function Icon1() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p1cfa1bc0} id="Vector" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p15fb5e00} id="Vector_2" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M9.33333 2.66667H14" id="Vector_3" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M9.33333 6H14" id="Vector_4" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M9.33333 10H14" id="Vector_5" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M9.33333 13.3333H14" id="Vector_6" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button1() {
  return (
    <div className="basis-0 content-stretch flex grow h-[32px] items-center justify-center min-h-px min-w-px relative rounded-[3.35544e+07px] shrink-0" data-name="Button">
      <Icon1 />
    </div>
  );
}

function Icon2() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p12824f00} id="Vector" stroke="var(--stroke-0, #0A0A0A)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button2() {
  return (
    <div className="content-stretch flex h-[32px] items-center justify-center relative rounded-[3.35544e+07px] shrink-0 w-[36px]" data-name="Button">
      <Icon2 />
    </div>
  );
}

function Tabs() {
  return (
    <div className="relative shrink-0 w-full" data-name="Tabs">
      <div className="flex flex-row items-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between px-[20px] py-0 relative w-full">
          <Button />
          <Button1 />
          <Button2 />
        </div>
      </div>
    </div>
  );
}

function ImageClassicSpaghettiCarbonara() {
  return <div className="absolute h-[245px] left-0 top-0 w-[196px]" data-name="Image (Classic Spaghetti Carbonara)" />;
}

function Container() {
  return <div className="absolute bg-gradient-to-t from-[rgba(0,0,0,0.7)] h-[245px] left-0 to-[rgba(0,0,0,0)] top-0 via-50% via-[rgba(0,0,0,0.2)] w-[196px]" data-name="Container" />;
}

function Text1() {
  return (
    <div className="absolute bg-[rgba(240,177,0,0.9)] content-stretch flex h-[23px] items-start left-[126.88px] px-[8px] py-[4px] rounded-[3.35544e+07px] top-[10px] w-[61.125px]" data-name="Text">
      <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-nowrap text-white">Medium</p>
    </div>
  );
}

function Text2() {
  return (
    <div className="absolute bg-[rgba(3,2,19,0.9)] content-stretch flex h-[23px] items-start left-[8px] px-[8px] py-[4px] rounded-[3.35544e+07px] top-[10px] w-[49.828px]" data-name="Text">
      <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-nowrap text-white">Italian</p>
    </div>
  );
}

function Heading() {
  return (
    <div className="h-[40px] overflow-clip relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[20px] left-0 not-italic text-[14px] text-white top-0 tracking-[-0.1504px] w-[113px]">Classic Spaghetti Carbonara</p>
    </div>
  );
}

function Icon3() {
  return (
    <div className="relative shrink-0 size-[12px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12 12">
        <g clipPath="url(#clip0_25_4316)" id="Icon">
          <path d="M6 3V6L8 7" id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
          <path d={svgPaths.p3e7757b0} id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
        </g>
        <defs>
          <clipPath id="clip0_25_4316">
            <rect fill="white" height="12" width="12" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Text3() {
  return (
    <div className="basis-0 grow h-[16px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.9)] text-nowrap">25 mins</p>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="h-[16px] relative shrink-0 w-[60.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-center relative size-full">
        <Icon3 />
        <Text3 />
      </div>
    </div>
  );
}

function Icon4() {
  return (
    <div className="basis-0 grow h-[12px] min-h-px min-w-px relative shrink-0" data-name="Icon">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid overflow-clip relative rounded-[inherit] size-full">
        <div className="absolute inset-[62.5%_33.33%_12.5%_8.33%]" data-name="Vector">
          <div className="absolute inset-[-16.67%_-7.14%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8 4">
              <path d={svgPaths.p9ccb900} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-[13.03%_20.85%_54.7%_66.67%]" data-name="Vector">
          <div className="absolute inset-[-12.92%_-33.38%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3 5">
              <path d={svgPaths.p2683eb40} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-[63.04%_8.33%_12.5%_79.17%]" data-name="Vector">
          <div className="absolute inset-[-17.04%_-33.33%_-17.04%_-33.34%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3 4">
              <path d={svgPaths.p1fdb75c8} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-[12.5%_45.83%_54.17%_20.83%]" data-name="Vector">
          <div className="absolute inset-[-12.5%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5 5">
              <path d={svgPaths.p312e4100} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Text4() {
  return (
    <div className="h-[16px] relative shrink-0 w-[7.734px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.9)] text-nowrap">4</p>
      </div>
    </div>
  );
}

function Container2() {
  return (
    <div className="h-[16px] relative shrink-0 w-[23.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-center relative size-full">
        <Icon4 />
        <Text4 />
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="content-stretch flex gap-[12px] h-[16px] items-center relative shrink-0 w-full" data-name="Container">
      <Container1 />
      <Container2 />
    </div>
  );
}

function Container4() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[6px] h-[86px] items-start left-0 pb-0 pt-[12px] px-[12px] top-[159px] w-[196px]" data-name="Container">
      <Heading />
      <Container3 />
    </div>
  );
}

function Container5() {
  return (
    <div className="h-[245px] overflow-clip relative shrink-0 w-[196px]" data-name="Container">
      <ImageClassicSpaghettiCarbonara />
      <Container />
      <Text1 />
      <Text2 />
      <Container4 />
    </div>
  );
}

function RecipeCard() {
  return (
    <div className="bg-white content-stretch flex flex-col items-start overflow-clip relative shrink-0" data-name="RecipeCard">
      <Container5 />
    </div>
  );
}

function ImageClassicSpaghettiCarbonara1() {
  return <div className="absolute h-[245px] left-0 top-0 w-[196px]" data-name="Image (Classic Spaghetti Carbonara)" />;
}

function Container6() {
  return <div className="absolute bg-gradient-to-t from-[rgba(0,0,0,0.7)] h-[245px] left-0 to-[rgba(0,0,0,0)] top-0 via-50% via-[rgba(0,0,0,0.2)] w-[196px]" data-name="Container" />;
}

function Text5() {
  return (
    <div className="absolute bg-[rgba(240,177,0,0.9)] content-stretch flex h-[23px] items-start left-[126.88px] px-[8px] py-[4px] rounded-[3.35544e+07px] top-[10px] w-[61.125px]" data-name="Text">
      <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-nowrap text-white">Medium</p>
    </div>
  );
}

function Text6() {
  return (
    <div className="absolute bg-[rgba(3,2,19,0.9)] content-stretch flex h-[23px] items-start left-[8px] px-[8px] py-[4px] rounded-[3.35544e+07px] top-[10px] w-[49.828px]" data-name="Text">
      <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-nowrap text-white">Italian</p>
    </div>
  );
}

function Heading1() {
  return (
    <div className="h-[40px] overflow-clip relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[20px] left-0 not-italic text-[14px] text-white top-0 tracking-[-0.1504px] w-[113px]">Classic Spaghetti Carbonara</p>
    </div>
  );
}

function Icon5() {
  return (
    <div className="relative shrink-0 size-[12px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12 12">
        <g clipPath="url(#clip0_25_4316)" id="Icon">
          <path d="M6 3V6L8 7" id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
          <path d={svgPaths.p3e7757b0} id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
        </g>
        <defs>
          <clipPath id="clip0_25_4316">
            <rect fill="white" height="12" width="12" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Text7() {
  return (
    <div className="basis-0 grow h-[16px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.9)] text-nowrap">25 mins</p>
      </div>
    </div>
  );
}

function Container7() {
  return (
    <div className="h-[16px] relative shrink-0 w-[60.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-center relative size-full">
        <Icon5 />
        <Text7 />
      </div>
    </div>
  );
}

function Icon6() {
  return (
    <div className="basis-0 grow h-[12px] min-h-px min-w-px relative shrink-0" data-name="Icon">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid overflow-clip relative rounded-[inherit] size-full">
        <div className="absolute inset-[62.5%_33.33%_12.5%_8.33%]" data-name="Vector">
          <div className="absolute inset-[-16.67%_-7.14%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8 4">
              <path d={svgPaths.p9ccb900} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-[13.03%_20.85%_54.7%_66.67%]" data-name="Vector">
          <div className="absolute inset-[-12.92%_-33.38%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3 5">
              <path d={svgPaths.p2683eb40} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-[63.04%_8.33%_12.5%_79.17%]" data-name="Vector">
          <div className="absolute inset-[-17.04%_-33.33%_-17.04%_-33.34%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3 4">
              <path d={svgPaths.p1fdb75c8} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-[12.5%_45.83%_54.17%_20.83%]" data-name="Vector">
          <div className="absolute inset-[-12.5%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5 5">
              <path d={svgPaths.p312e4100} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.9" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Text8() {
  return (
    <div className="h-[16px] relative shrink-0 w-[7.734px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.9)] text-nowrap">4</p>
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="h-[16px] relative shrink-0 w-[23.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-center relative size-full">
        <Icon6 />
        <Text8 />
      </div>
    </div>
  );
}

function Container9() {
  return (
    <div className="content-stretch flex gap-[12px] h-[16px] items-center relative shrink-0 w-full" data-name="Container">
      <Container7 />
      <Container8 />
    </div>
  );
}

function Container10() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[6px] h-[86px] items-start left-0 pb-0 pt-[12px] px-[12px] top-[159px] w-[196px]" data-name="Container">
      <Heading1 />
      <Container9 />
    </div>
  );
}

function Container11() {
  return (
    <div className="h-[245px] overflow-clip relative shrink-0 w-[390px]" data-name="Container">
      <ImageClassicSpaghettiCarbonara1 />
      <Container6 />
      <Text5 />
      <Text6 />
      <Container10 />
    </div>
  );
}

function RecipeCard1() {
  return (
    <div className="bg-white content-stretch flex flex-col items-start overflow-clip relative shrink-0 w-[196px]" data-name="RecipeCard">
      <Container11 />
    </div>
  );
}

function Cards() {
  return (
    <div className="content-stretch flex gap-px items-start relative shrink-0 w-full" data-name="Cards">
      <RecipeCard />
      <RecipeCard1 />
    </div>
  );
}

function Grid() {
  return (
    <div className="relative shrink-0 w-full" data-name="Grid">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-px items-start relative w-full">
        {[...Array(2).keys()].map((_, i) => (
          <Cards key={i} />
        ))}
      </div>
    </div>
  );
}

function Bottom() {
  return (
    <div className="bg-white content-stretch flex flex-col gap-[18px] items-start justify-center px-0 py-[20px] relative shrink-0 w-full" data-name="Bottom">
      <Tabs />
      <Grid />
    </div>
  );
}

function Content() {
  return (
    <div className="basis-0 content-stretch flex flex-col gap-[24px] grow items-center min-h-px min-w-px relative shrink-0 w-full" data-name="Content">
      <Top />
      <Bottom />
    </div>
  );
}

function Body() {
  return (
    <div className="absolute content-stretch flex flex-col h-[797px] items-center justify-end left-0 top-[47px]" data-name="Body">
      <Nav />
      <Glow />
      <Content />
    </div>
  );
}

export default function JamieOliver() {
  return (
    <div className="bg-white relative size-full" data-name="JamieOliver">
      <TopNavigation />
      <Body />
    </div>
  );
}