import sys
import importlib
from concurrent.futures import ThreadPoolExecutor
from types import ModuleType
from typing import Any, List, Callable
from tqdm import tqdm

from ...globals import execution_threads, fp_ui, frame_processors, execution_providers, max_memory

FRAME_PROCESSORS_MODULES: List[ModuleType] = []
FRAME_PROCESSORS_INTERFACE = [
    'pre_check',
    'pre_start',
    'process_frame',
    'process_image',
    'process_video'
]


def load_frame_processor_module(frame_processor: str) -> Any:
    try:
        frame_processor_module = importlib.import_module(f'....modules.processors.frame.{frame_processor}', package=__name__)
        for method_name in FRAME_PROCESSORS_INTERFACE:
            if not hasattr(frame_processor_module, method_name):
                sys.exit()
    except ImportError:
        print(f"Frame processor {frame_processor} not found")
        sys.exit()
    return frame_processor_module


def get_frame_processors_modules(frame_processors_list: List[str]) -> List[ModuleType]:
    global FRAME_PROCESSORS_MODULES

    if not FRAME_PROCESSORS_MODULES:
        for frame_processor in frame_processors_list:
            frame_processor_module = load_frame_processor_module(frame_processor)
            FRAME_PROCESSORS_MODULES.append(frame_processor_module)
    set_frame_processors_modules_from_ui(frame_processors_list)
    return FRAME_PROCESSORS_MODULES

def set_frame_processors_modules_from_ui(frame_processors_list: List[str]) -> None:
    global FRAME_PROCESSORS_MODULES
    current_processor_names = [proc.__name__.split('.')[-1] for proc in FRAME_PROCESSORS_MODULES]

    for frame_processor, state in fp_ui.items():
        if state == True and frame_processor not in current_processor_names:
            try:
                frame_processor_module = load_frame_processor_module(frame_processor)
                FRAME_PROCESSORS_MODULES.append(frame_processor_module)
                if frame_processor not in frame_processors:
                     frame_processors.append(frame_processor)
            except SystemExit:
                 print(f"Warning: Failed to load frame processor {frame_processor} requested by UI state.")
            except Exception as e:
                 print(f"Warning: Error loading frame processor {frame_processor} requested by UI state: {e}")

        elif state == False and frame_processor in current_processor_names:
            try:
                module_to_remove = next((mod for mod in FRAME_PROCESSORS_MODULES if mod.__name__.endswith(f'.{frame_processor}')), None)
                if module_to_remove:
                    FRAME_PROCESSORS_MODULES.remove(module_to_remove)
                if frame_processor in frame_processors:
                    frame_processors.remove(frame_processor)
            except Exception as e:
                 print(f"Warning: Error removing frame processor {frame_processor}: {e}")

def multi_process_frame(source_path: str, temp_frame_paths: List[str], process_frames: Callable[[str, List[str], Any], None], progress: Any = None) -> None:
    with ThreadPoolExecutor(max_workers=execution_threads) as executor:
        futures = []
        for path in temp_frame_paths:
            future = executor.submit(process_frames, source_path, [path], progress)
            futures.append(future)
        for future in futures:
            future.result()


def process_video(source_path: str, frame_paths: list[str], process_frames: Callable[[str, List[str], Any], None]) -> None:
    progress_bar_format = '{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}{postfix}]'
    total = len(frame_paths)
    with tqdm(total=total, desc='Processing', unit='frame', dynamic_ncols=True, bar_format=progress_bar_format) as progress:
        progress.set_postfix({'execution_providers': execution_providers, 'execution_threads': execution_threads, 'max_memory': max_memory})
        multi_process_frame(source_path, frame_paths, process_frames, progress)
