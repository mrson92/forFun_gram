1. 개요

본 시스템은 Codeit 디자인 가이드라인에 따른 컴포넌트 명세입니다. 개발 시 일관성을 위해 아래 정의된 컴포넌트 명세(Props)를 엄격히 준수합니다.



2. 컴포넌트 상세 명세 (Interface)

각 컴포넌트는 아래와 같은 속성 구조를 가집니다. (TypeScript 기준 예시)



2.1 Buttons

TypeScript

interface ButtonProps {

  variant: 'primary' | 'secondary' | 'tertiary' | 'text' | 'icon';

  size: 'L' | 'M' | 'S';

  state: 'default' | 'hover' | 'disabled';

  label?: string; // Icon variant 제외 필수

  icon?: React.ReactNode;

  onClick: () => void;

}

2.2 Text Field & Textarea

TypeScript

interface InputProps {

  label: string;

  placeholder: string;

  state: 'default' | 'focus' | 'error' | 'disabled';

  helperText?: string;

  value: string;

  onChange: (value: string) => void;

}

2.3 Modal

TypeScript

interface ModalProps {

  title: string;

  isOpen: boolean;

  onClose: () => void;

  actions: ButtonProps[]; // 최대 2개 권장

}

3. 디자인 시스템 토큰 (Foundations)

컴포넌트 구현 시 아래 스펙을 기준으로 적용합니다.



Spacing: 4px grid (4, 8, 12, 16, 24, 32px)



Border Radius: * Small: 4px



Medium: 8px



Large: 12px



Typography:



Heading: Pretendard, 700 weight



Body: Pretendard, 400 weight



4. 컴포넌트 리스트 (상세 정의 대상)

Accordion: 내부 콘텐츠 상태 관리(open/close) 필수.



Bottom Sheet: 모바일 환경 전용, 오버레이 제어.



Buttons: 위 2.1 절 명세 준수.



Checkbox/Radio: checked 상태 기반 제어.



Dropdown/Select: 옵션 배열 데이터 바인딩.



Label: 상태값에 따른 색상 구분 (Success, Warning, Error).



Pagination: 현재 페이지(currentPage), 전체 페이지(totalPages) 관리.



Snackbar/Toast: setTimeout을 통한 자동 닫힘 로직 포함.



Table: 데이터 행(row) 배열 매핑, 정렬 기능 지원.



Tooltip: 마우스 오버 시 isVisible 상태 제어.



5. 구현 가이드

Naming Convention: [ComponentName][Variant][Size] 형식 준수 (예: PrimaryButtonL).



Accessibility: 모든 인터랙티브 요소는 aria-label 및 키보드 접근성(Tab, Enter, Space)을 보장해야 합니다.



Responsive: 모바일 환경에서는 컴포넌트의 width를 100%로 확장하여 가용 영역을 최적화합니다.
