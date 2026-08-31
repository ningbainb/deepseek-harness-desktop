import React, { useState } from 'react'
import styles from './value-mode.module.css'

export interface ManualExpertToggleProps {
  armed?: boolean
  onToggle?: (nextArmed: boolean) => void
}

export const ManualExpertToggle: React.FC<ManualExpertToggleProps> = ({
  armed = false,
  onToggle,
}) => {
  const [isArmed, setIsArmed] = useState(armed)

  const handleClick = () => {
    const next = !isArmed
    setIsArmed(next)
    onToggle?.(next)
  }

  return (
    <button
      type="button"
      className={`${styles.manualToggle} ${isArmed ? styles.manualToggleActive : ''}`}
      onClick={handleClick}
      title={isArmed ? '本次请求将优先使用专家分析（点击取消）' : '点击指示下一次请求使用专家分析'}
    >
      <span style={{ fontSize: 10 }}>★</span>
      <span>{isArmed ? '本次使用专家分析' : '专家分析'}</span>
    </button>
  )
}
