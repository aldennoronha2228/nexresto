import Image from 'next/image';

type NexRestoLogoProps = {
    variant?: 'mark' | 'full';
    className?: string;
    priority?: boolean;
};

export default function NexRestoLogo({ variant = 'mark', className, priority = false }: NexRestoLogoProps) {
    if (variant === 'full') {
        return (
            <Image
                src="/nexresto-logo.png"
                alt="NexResto"
                width={340}
                height={340}
                className={className}
                priority={priority}
            />
        );
    }

    return (
        <Image
            src="/nexresto-logo.png"
            alt="NexResto"
            width={64}
            height={64}
            className={className}
            priority={priority}
        />
    );
}
