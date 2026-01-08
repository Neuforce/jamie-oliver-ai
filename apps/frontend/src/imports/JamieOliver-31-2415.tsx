import svgPaths from "./svg-hc9dh3ktps";
import imgImage11 from "figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png";
import imgEllipse2 from "figma:asset/dbe757ff22db65b8c6e8255fc28d6a6a29240332.png";

function Close() {
  return (
    <div className="absolute left-[11px] size-[24px] top-[16px]" data-name="close">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g>
          <path d="M18 6L6 18M6 6L18 18" id="Vector" stroke="var(--stroke-0, #327179)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function Nav() {
  return (
    <div className="bg-white h-[56px] relative rounded-bl-[16px] rounded-br-[16px] shrink-0 w-[390px]" data-name="Nav">
      <Close />
      <div className="absolute h-[24px] left-[110px] top-[16px] w-[171.75px]" data-name="image 11">
        <img alt="" className="absolute inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgImage11} />
      </div>
    </div>
  );
}

function HorizontalInset() {
  return (
    <div className="h-px relative shrink-0 w-full" data-name="Horizontal/Inset">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 350 1">
        <g id="Horizontal/Inset"></g>
      </svg>
    </div>
  );
}

function Frame1() {
  return (
    <div className="content-stretch flex items-center relative shrink-0">
      <div className="relative shrink-0 size-[31.875px]">
        <div className="absolute inset-[-10%]">
          <img alt="" className="block max-w-none size-full" height="38.25" src={imgEllipse2} width="38.25" />
        </div>
      </div>
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex gap-[16px] items-start justify-center relative shrink-0 w-full">
      <Frame1 />
      <p className="basis-0 font-['Work_Sans:Regular',sans-serif] font-normal grow leading-[1.5] min-h-px min-w-px relative shrink-0 text-[#2c2c2c] text-[16px]">
        <span>
          {`That way, we’re set to cook smoothly and enjoy every step!"`}
          <br aria-hidden="true" />
          <br aria-hidden="true" />
          {`Hey, `}
        </span>
        <span className="font-['Work_Sans:Bold',sans-serif] font-bold">quick tip before we dive in</span>
        <span>{` — let me know when you finish each step. That way, I can keep up with you. Ready to start cooking?`}</span>
      </p>
    </div>
  );
}

function Title() {
  return (
    <div className="bg-[#f5f5f5] relative rounded-[16px] shrink-0 w-full" data-name="Title">
      <div className="flex flex-col items-center size-full">
        <div className="content-stretch flex flex-col items-center p-[16px] relative w-full">
          <p className="font-['Work_Sans:Regular',sans-serif] font-normal leading-[24px] relative shrink-0 text-[#090909] text-[16px] w-full">{`Give me more details of the recipe `}</p>
        </div>
      </div>
    </div>
  );
}

function Frame3() {
  return (
    <div className="content-stretch flex items-center relative shrink-0">
      <div className="relative shrink-0 size-[31.875px]">
        <div className="absolute inset-[-10%]">
          <img alt="" className="block max-w-none size-full" height="38.25" src={imgEllipse2} width="38.25" />
        </div>
      </div>
    </div>
  );
}

function Frame() {
  return (
    <div className="content-stretch flex gap-[16px] items-start justify-center relative shrink-0 w-full">
      <Frame3 />
      <div className="basis-0 font-['Work_Sans:Regular',sans-serif] font-normal grow leading-[1.5] min-h-px min-w-px relative shrink-0 text-[#2c2c2c] text-[16px]">
        <p className="mb-0">
          <span className="font-['Work_Sans:Bold',sans-serif] font-bold">Perfect!</span>
          <span>{` This one’s `}</span>
          <span className="font-['Work_Sans:Bold',sans-serif] font-bold">quick, punchy, and absolutely delicious</span>
          <span>
            {` — ideal for a midweek pick-me-up. It’s not too tricky, serves one, and has just the right amount of heat and flavor to make you smile.`}
            <br aria-hidden="true" />
            <br aria-hidden="true" />
          </span>
        </p>
        <p className="mb-0">
          <span>{`It cooks in `}</span>
          <span className="font-['Work_Sans:Bold',sans-serif] font-bold">only 13 minutes</span>
          <span>{`, and each serving hits a great balance — `}</span>
          <span className="font-['Work_Sans:Bold',sans-serif] font-bold">{`high in protein (18.4g) `}</span>and<span className="font-['Work_Sans:Bold',sans-serif] font-bold">{` good carbs (46.9g), `}</span>
          <span>{`while keeping `}</span>
          <span className="font-['Work_Sans:Bold',sans-serif] font-bold">fats and sugars in check.</span>
          <span>
            <br aria-hidden="true" />
            <br aria-hidden="true" />
          </span>
        </p>
        <p>Ready to get started? I’ll walk you through it step by step — you’ll be eating in no time</p>
      </div>
    </div>
  );
}

function Mid() {
  return (
    <div className="relative shrink-0 w-full" data-name="Mid">
      <div className="flex flex-col items-center size-full">
        <div className="content-stretch flex flex-col gap-[16px] items-center px-[20px] py-0 relative w-full">
          <HorizontalInset />
          <Frame2 />
          <Title />
          <Frame />
        </div>
      </div>
    </div>
  );
}

function Container() {
  return (
    <div className="content-stretch flex flex-col items-center relative shrink-0 w-[390px]" data-name="Container">
      <Mid />
    </div>
  );
}

function Body() {
  return (
    <div className="absolute content-stretch flex flex-col items-center left-0 top-[47px]" data-name="Body">
      <Nav />
      <Container />
    </div>
  );
}

function TablerIconArrowUp() {
  return (
    <div className="absolute left-1/2 size-[24px] top-1/2 translate-x-[-50%] translate-y-[-50%]" data-name="tabler-icon-arrow-up">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="tabler-icon-arrow-up">
          <path d={svgPaths.pba57d40} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Button() {
  return (
    <div className="bg-[#b4b4b4] overflow-clip relative rounded-[20px] shrink-0 size-[36px]" data-name="Button">
      <TablerIconArrowUp />
    </div>
  );
}

function ButtonContainer() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-name="Button container">
      <Button />
    </div>
  );
}

function InputContainer() {
  return (
    <div className="content-stretch flex gap-[20px] items-center relative shrink-0 w-full" data-name="Input container">
      <p className="basis-0 font-['Inter:Regular',sans-serif] font-normal grow leading-[24px] min-h-px min-w-px not-italic overflow-ellipsis overflow-hidden relative shrink-0 text-[#8e8e93] text-[16px]">Ask your question…</p>
      <ButtonContainer />
    </div>
  );
}

function ChatInput() {
  return (
    <div className="bg-white relative rounded-[32px] shrink-0 w-full" data-name="Chat input">
      <div aria-hidden="true" className="absolute border border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[32px] shadow-[0px_2px_5px_0px_rgba(0,0,0,0.06),0px_9px_9px_0px_rgba(0,0,0,0.01)]" />
      <div className="size-full">
        <div className="content-stretch flex flex-col items-start p-[12px] relative w-full">
          <InputContainer />
        </div>
      </div>
    </div>
  );
}

function ChatInputMobile() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center overflow-x-auto overflow-y-clip px-0 py-[12px] relative shrink-0 w-full" data-name="Chat input / Mobile">
      <ChatInput />
    </div>
  );
}

function ChatInput1() {
  return (
    <div className="absolute bottom-0 content-stretch flex flex-col h-[96px] items-center justify-center left-1/2 px-0 py-[12px] translate-x-[-50%] w-[350px]" data-name="Chat input">
      <ChatInputMobile />
    </div>
  );
}

export default function JamieOliver() {
  return (
    <div className="bg-white relative size-full" data-name="JamieOliver">
      <ChatInput1 />
      <Body />
    </div>
  );
}